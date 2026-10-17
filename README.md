# ResearchCheck — improved matching MVP

## Run
Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```
Open http://localhost:3000.

## What changed
- The API still queries Crossref and OpenAlex, but no longer displays every top-N API result as a possible match.
- It reconstructs OpenAlex abstracts when indexed abstract data is available.
- It computes title, abstract-token and optional author overlap features.
- It filters low-relevance records and labels results as potential matches rather than confirmed duplicates.
- If no likely match is found, the UI reports that no sufficiently similar record was found in the checked public sources, with an explicit warning that this does not prove the paper is unique or unpublished.
- The report says how many likely matches were returned and which sources succeeded.

## Limitations
- This is still a heuristic text-matching MVP, not a calibrated AI semantic similarity model.
- Public APIs cannot reliably reveal private submissions, under-review manuscripts, or revision requests. Those need authorized journal integrations or evidence provided by the author/institution.
- A no-match result means no likely match was found in the sources checked; coverage is incomplete.
- The submission registry is stored in browser localStorage. It is not a secure multi-user database and must not be used for confidential institutional data as-is.
- Metadata may omit abstracts, authors, years, or journal names. Always verify the publisher/repository record.

## Deploy
Push the project to GitHub, import into Vercel, and deploy using default Next.js settings. Test the deployed endpoint and review API provider rate limits before public promotion.
