import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
type Result = { source: string; title: string; abstract: string | null; year: number | null; url: string | null; doi: string | null; authors: string[] };
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";

async function semanticScholar(q: string): Promise<Result[]> {
  const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
  url.searchParams.set("query", q); url.searchParams.set("limit", "5");
  url.searchParams.set("fields", "title,abstract,url,year,externalIds,authors");
  const headers: HeadersInit = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Semantic Scholar HTTP ${r.status}`);
  const j = await r.json();
  return (j.data ?? []).map((p: any) => ({ source: "Semantic Scholar", title: str(p.title) || "Untitled", abstract: str(p.abstract) || null, year: typeof p.year === "number" ? p.year : null, url: str(p.url) || null, doi: str(p.externalIds?.DOI) || null, authors: (p.authors ?? []).map((a: any) => str(a.name)).filter(Boolean) }));
}
async function coreSearch(q: string): Promise<Result[]> {
  const key = process.env.CORE_API_KEY; if (!key) return [];
  const r = await fetch("https://api.core.ac.uk/v3/search/works", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ q, limit: 5 }), cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`CORE HTTP ${r.status}`);
  const j = await r.json();
  return (j.results ?? []).map((p: any) => ({ source: "CORE", title: str(p.title) || "Untitled", abstract: str(p.abstract) || null, year: typeof p.yearPublished === "number" ? p.yearPublished : null, url: str(p.downloadUrl) || str(p.sourceFulltextUrls?.[0]) || null, doi: str(p.doi) || null, authors: Array.isArray(p.authors) ? p.authors.map((a: any) => typeof a === "string" ? a : str(a.name)).filter(Boolean) : [] }));
}
async function googleScholar(q: string): Promise<Result[]> {
  // Google Scholar has no general public API. This example uses SerpAPI as an authorized provider.
  const key = process.env.SERPAPI_API_KEY; if (!key) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_scholar"); url.searchParams.set("q", q); url.searchParams.set("api_key", key); url.searchParams.set("num", "5");
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Google Scholar provider HTTP ${r.status}`);
  const j = await r.json();
  return (j.organic_results ?? []).map((p: any) => ({ source: "Google Scholar", title: str(p.title) || "Untitled", abstract: str(p.snippet) || null, year: typeof p.year === "number" ? p.year : null, url: str(p.link) || null, doi: null, authors: Array.isArray(p.publication_info?.authors) ? p.publication_info.authors.map((a: any) => str(a.name)).filter(Boolean) : [] }));
}
export async function GET(req: NextRequest) {
  const title = str(req.nextUrl.searchParams.get("title"));
  const abstract = str(req.nextUrl.searchParams.get("abstract"));
  const query = title || abstract;
  if (!query) return NextResponse.json({ error: "Provide title or abstract query parameter." }, { status: 400 });
  if (query.length > 5000) return NextResponse.json({ error: "Query too long (max 5000 characters)." }, { status: 400 });
  const providers = await Promise.all([
    { name: "Semantic Scholar", configured: true, run: semanticScholar },
    { name: "CORE", configured: Boolean(process.env.CORE_API_KEY), run: coreSearch },
    { name: "Google Scholar", configured: Boolean(process.env.SERPAPI_API_KEY), run: googleScholar },
  ].map(async p => {
    try { return { provider: p.name, configured: p.configured, results: await p.run(query), error: null as string | null }; }
    catch (e) { return { provider: p.name, configured: p.configured, results: [] as Result[], error: e instanceof Error ? e.message : "Provider failed" }; }
  }));
  return NextResponse.json({ queryType: title ? "title" : "abstract", query, note: "Candidate records only; not proof of plagiarism or uniqueness.", providers, results: providers.flatMap(p => p.results) });
}
