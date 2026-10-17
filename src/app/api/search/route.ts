import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Author = { name: string; orcid?: string };

type Paper = {
  id: string;
  source: string;
  title: string;
  authors: Author[];
  venue: string;
  year: string;
  doi: string;
  url: string;
  type: string;
  abstract: string;
  score: number;
  titleSimilarity: number;
  abstractSimilarity: number;
  authorSimilarity: number;
  querySimilarity: number;
  reasons: string[];
};

const STOP = new Set(
  ("a an the and or but of for to in on with by from at as is are was were be been being " +
    "this that these those it its their they we our you your can may might will would should " +
    "into over under between across using use based study studies method methods approach " +
    "results result paper proposed new research problem system model data analysis show shows " +
    "shown demonstrate demonstrates evaluate evaluated evaluation performance article various").split(/\s+/)
);

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalize(value: string): string {
  return value
    .replace(/([A-Za-z]{2,})-\s+([a-z]{2,})/g, "$1$2")
    .replace(/\bappli\s+cations\b/gi, "applications")
    .replace(/\bimplemen\s+tations\b/gi, "implementations")
    .replace(/\bperfor\s+mance\b/gi, "performance")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function tokenScores(input: string, candidate: string) {
  const a = tokens(input);
  const b = tokens(candidate);
  const setA = new Set(a);
  const setB = new Set(b);
  if (!setA.size || !setB.size) {
    return { jaccard: 0, inputCoverage: 0, candidateCoverage: 0 };
  }
  let intersection = 0;
  setA.forEach((word) => {
    if (setB.has(word)) intersection++;
  });
  return {
    jaccard: intersection / new Set([...setA, ...setB]).size,
    inputCoverage: intersection / setA.size,
    candidateCoverage: intersection / setB.size,
  };
}

function authorsFromCrossref(item: any): Author[] {
  return Array.isArray(item.author)
    ? item.author.map((author: any) => ({
        name:
          [clean(author.given), clean(author.family)].filter(Boolean).join(" ") ||
          clean(author.name) ||
          "Unknown author",
        orcid: clean(author.ORCID) || undefined,
      }))
    : [];
}

function authorsFromOpenAlex(item: any): Author[] {
  return Array.isArray(item.authorships)
    ? item.authorships.map((entry: any) => ({
        name: clean(entry.author?.display_name) || "Unknown author",
        orcid: clean(entry.author?.orcid) || undefined,
      }))
    : [];
}

function reconstructAbstract(index: any): string {
  if (!index || typeof index !== "object") return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    if (Array.isArray(positions)) {
      for (const position of positions) {
        if (typeof position === "number") words[position] = word;
      }
    }
  }
  return words.filter(Boolean).join(" ");
}

function stripAbstract(raw: string): string {
  return clean(
    raw
      .replace(/<[^>]*>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "ResearchPaperChecker/2.1" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildQueries(title: string, abstract: string): string[] {
  if (title) return [title];
  const sentences = abstract
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map(clean)
    .filter((sentence) => tokens(sentence).length >= 5);
  const ranked = sentences
    .map((sentence) => {
      const words = tokens(sentence);
      return {
        sentence,
        score: words.filter((word) => word.length >= 6).length + new Set(words).size * 0.5,
      };
    })
    .sort((a, b) => b.score - a.score);
  const queries = [abstract.slice(0, 220)];
  for (const item of ranked) {
    if (queries.length >= 4) break;
    const candidate = item.sentence.slice(0, 300);
    if (!queries.some((existing) => normalize(existing) === normalize(candidate))) {
      queries.push(candidate);
    }
  }
  return [...new Set(queries.map(clean).filter(Boolean))];
}

function makeCrossrefPaper(item: any, index: number): Paper {
  const published =
    item.published?.["date-parts"]?.[0] ||
    item["published-print"]?.["date-parts"]?.[0] ||
    item["published-online"]?.["date-parts"]?.[0] ||
    [];
  const doi = clean(item.DOI);
  const rawTitle = Array.isArray(item.title) ? item.title[0] : item.title;
  return {
    id: `crossref:${doi || index}`,
    source: "Crossref",
    title: clean(rawTitle) || "Untitled record",
    authors: authorsFromCrossref(item),
    venue: clean(Array.isArray(item["container-title"]) ? item["container-title"][0] : item["container-title"]),
    year: published[0] ? String(published[0]) : "",
    doi,
    url: clean(item.URL) || (doi ? `https://doi.org/${doi}` : ""),
    type: clean(item.type) || "scholarly record",
    abstract: stripAbstract(clean(item.abstract)),
    score: 0,
    titleSimilarity: 0,
    abstractSimilarity: 0,
    authorSimilarity: 0,
    querySimilarity: 0,
    reasons: [],
  };
}

function makeOpenAlexPaper(item: any, index: number): Paper {
  const doi = clean(item.doi).replace(/^https?:\/\/doi\.org\//i, "");
  return {
    id: `openalex:${clean(item.id) || index}`,
    source: "OpenAlex",
    title: clean(item.title) || "Untitled record",
    authors: authorsFromOpenAlex(item),
    venue: clean(item.primary_location?.source?.display_name),
    year: item.publication_year ? String(item.publication_year) : "",
    doi,
    url: clean(item.primary_location?.landing_page_url) || (doi ? `https://doi.org/${doi}` : clean(item.id)),
    type: clean(item.type) || "scholarly work",
    abstract: reconstructAbstract(item.abstract_inverted_index),
    score: 0,
    titleSimilarity: 0,
    abstractSimilarity: 0,
    authorSimilarity: 0,
    querySimilarity: 0,
    reasons: [],
  };
}

function rankPaper(
  paper: Paper,
  title: string,
  abstract: string,
  queries: string[],
  requestedAuthors: string[]
): Paper {
  const titleScores = title ? tokenScores(title, paper.title) : { jaccard: 0, inputCoverage: 0, candidateCoverage: 0 };
  const abstractScores = abstract && paper.abstract
    ? tokenScores(abstract, paper.abstract)
    : { jaccard: 0, inputCoverage: 0, candidateCoverage: 0 };
  const queryScores = queries.map((query) =>
    tokenScores(query, `${paper.title} ${paper.abstract}`)
  );
  const querySimilarity = Math.max(0, ...queryScores.map((s) => s.jaccard));
  const paperAuthors = paper.authors.map((author) => normalize(author.name));
  const authorSimilarity = requestedAuthors.length
    ? requestedAuthors.filter((wanted) =>
        paperAuthors.some((found) => found === wanted || found.includes(wanted) || wanted.includes(found))
      ).length / requestedAuthors.length
    : 0;

  // Scores are used to rank candidates only. The strict final gate below decides
  // whether a candidate is close enough to be reported as the same paper.
  const titleSimilarity = title
    ? Math.max(titleScores.jaccard, titleScores.inputCoverage, titleScores.candidateCoverage)
    : 0;
  const abstractSimilarity = abstract
    ? Math.max(abstractScores.jaccard, abstractScores.inputCoverage * 0.9, abstractScores.candidateCoverage * 0.9)
    : 0;
  const score = title
    ? Math.round(titleScores.jaccard * 45 + titleScores.inputCoverage * 25 + abstractScores.jaccard * 20 + authorSimilarity * 10)
    : Math.round(abstractScores.jaccard * 55 + abstractScores.inputCoverage * 30 + abstractScores.candidateCoverage * 10 + authorSimilarity * 5);

  const reasons: string[] = [];
  if (title && normalize(title) === normalize(paper.title)) reasons.push("Exact normalized title");
  if (abstract && abstractScores.jaccard >= 0.65 && abstractScores.inputCoverage >= 0.85) reasons.push("Strong full-abstract match");
  if (authorSimilarity > 0) reasons.push("Author names overlap");

  return { ...paper, score, titleSimilarity, abstractSimilarity, authorSimilarity, querySimilarity, reasons };
}

function isStrictMatch(paper: Paper, title: string, abstract: string): boolean {
  const normalizedTitleExact = Boolean(title) && normalize(title) === normalize(paper.title);
  if (normalizedTitleExact) return true;

  // Without an exact title, require a stored abstract and a strong overlap across
  // the entire input abstract. A match on a few keywords/sentences is not enough.
  if (!abstract || !paper.abstract) return false;
  const s = tokenScores(abstract, paper.abstract);
  return (
    s.jaccard >= 0.65 &&
    s.inputCoverage >= 0.85 &&
    s.candidateCoverage >= 0.75
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = clean(body.title).slice(0, 500);
    const abstract = clean(body.abstract).slice(0, 15000);
    const authorInput = clean(body.authors).slice(0, 1000);
    const requestedAuthors = authorInput.split(/[,;\n]/).map(normalize).filter(Boolean);

    if (!title && !abstract) {
      return NextResponse.json({ error: "Enter a title or abstract to search." }, { status: 400 });
    }

    const queries = buildQueries(title, abstract);
    const allCandidates: Paper[] = [];
    const tasks = queries.flatMap((query) => {
      const encoded = encodeURIComponent(query);
      return [
        {
          source: "Crossref",
          url: `https://api.crossref.org/works?query.bibliographic=${encoded}&rows=25&select=DOI,title,author,published,published-print,published-online,container-title,URL,type,abstract`,
          parse: (data: any) => (data.message?.items || []).map((item: any, index: number) => makeCrossrefPaper(item, index)),
        },
        {
          source: "OpenAlex",
          url: `https://api.openalex.org/works?search=${encoded}&per-page=25`,
          parse: (data: any) => (data.results || []).map((item: any, index: number) => makeOpenAlexPaper(item, index)),
        },
      ];
    });

    const settled = await Promise.allSettled(tasks.map((task) => fetchJson(task.url)));
    let crossrefSuccess = false;
    let openAlexSuccess = false;
    settled.forEach((result, index) => {
      const task = tasks[index];
      if (result.status !== "fulfilled") return;
      allCandidates.push(...task.parse(result.value));
      if (task.source === "Crossref") crossrefSuccess = true;
      if (task.source === "OpenAlex") openAlexSuccess = true;
    });

    const deduped = new Map<string, Paper>();
    for (const paper of allCandidates) {
      const key = paper.doi
        ? `doi:${paper.doi.toLowerCase()}`
        : `title:${normalize(paper.title)}`;
      const previous = deduped.get(key);
      if (!previous || (paper.abstract && !previous.abstract)) deduped.set(key, paper);
    }

    const ranked = [...deduped.values()].map((paper) => rankPaper(paper, title, abstract, queries, requestedAuthors));
    const exactMatches = ranked
      .filter((paper) => isStrictMatch(paper, title, abstract))
      .sort((a, b) => b.score - a.score);

    // The API deliberately returns at most one record. It does not return related papers.
    const results = exactMatches.length ? [exactMatches[0]] : [];
    const anySourceSucceeded = crossrefSuccess || openAlexSuccess;

    return NextResponse.json({
      results,
      sourceStatus: [
        { source: "Crossref", ok: crossrefSuccess, message: crossrefSuccess ? "Search completed" : "Source unavailable during this search" },
        { source: "OpenAlex", ok: openAlexSuccess, message: openAlexSuccess ? "Search completed" : "Source unavailable during this search" },
      ],
      searchedAt: new Date().toISOString(),
      outcome: results.length ? "exact_match_found" : anySourceSucceeded ? "no_exact_match" : "search_unavailable",
      candidatesReviewed: allCandidates.length,
      queriesUsed: queries,
      disclaimer: "Only one strict match is returned. A missing result does not prove uniqueness: the paper may be absent from these public databases, or its stored abstract may differ. Private journal submissions and peer-review status are not queried.",
    });
  } catch (error) {
    console.error("Paper search failed:", error);
    return NextResponse.json({ error: "Search failed. Check your internet connection and try again." }, { status: 500 });
  }
}
