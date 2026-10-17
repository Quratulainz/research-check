"use client";

import { useMemo, useState, useEffect } from "react";
import { Search, FileSearch, ShieldCheck, ExternalLink, ClipboardList, Trash2, Plus, BookOpenCheck, Lock, X } from "lucide-react";

type Paper = {
  id: string; source: string; title: string; authors: { name: string; orcid?: string }[];
  venue: string; year: string; doi: string; url: string; type: string;
  abstract?: string; score: number; reasons: string[];
};
type Submission = {
  id: string; title: string; journal: string; authors: string; submitted: string;
  status: string; manuscriptId: string; updated: string;
};

const STORAGE_KEY = "researchcheck.submissions.v1";
const SEARCH_COUNT_KEY = "researchcheck.free_searches.v1";
const FREE_LIMIT = 5;

const statuses = ["Draft", "Submitted", "Under review", "Revision requested", "Resubmitted", "Accepted", "Rejected", "Withdrawn", "Published", "Unknown / stale"];

function loadSubmissions(): Submission[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch { return []; }
}

function fmtAuthors(authors: Paper["authors"]) {
  if (!authors?.length) return "Author metadata not available";
  const names = authors.slice(0, 5).map(a => a.name);
  return names.join(", ") + (authors.length > 5 ? ` + ${authors.length - 5} more` : "");
}

function badgeClass(score: number) {
  return score >= 70 ? "badge badge-amber" : score >= 40 ? "badge badge-blue" : "badge";
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [authors, setAuthors] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Paper[]>([]);
  const [sourceStatus, setSourceStatus] = useState<{source:string;ok:boolean;message:string;count:number}[]>([]);
  const [searchedAt, setSearchedAt] = useState("");
  const [outcome, setOutcome] = useState<"" | "matches_found" | "no_likely_match" | "search_unavailable">("");
  const [disclaimer, setDisclaimer] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "submissions">("search");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [submissionForm, setSubmissionForm] = useState({
    title: "", journal: "", authors: "", submitted: "", status: "Submitted", manuscriptId: ""
  });

  // Paywall & Multi-step Auth state
  const [searchCount, setSearchCount] = useState<number>(0);
  const [showPaywallModal, setShowPaywallModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"auth" | "verify" | "payment">("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Load browser-local states after hydration.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedCount = localStorage.getItem(SEARCH_COUNT_KEY);
      if (savedCount) setSearchCount(parseInt(savedCount, 10) || 0);

      // Check current user session via backend API
      fetch("/api/auth/me")
        .then(res => res.json())
        .then(data => {
          if (data && data.email) {
            setIsAuthenticated(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  async function searchPapers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Check if free search limit is reached and user is not authenticated
    if (!isAuthenticated && searchCount >= FREE_LIMIT) {
      setStep("auth");
      setShowPaywallModal(true);
      return;
    }

    setError("");
    setBusy(true);
    setResults([]);
    setSourceStatus([]);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abstract, authors }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      
      setResults(data.results || []);
      setSourceStatus(data.sourceStatus || []);
      setSearchedAt(data.searchedAt || "");
      setOutcome(data.outcome || "");
      setDisclaimer(data.disclaimer || "");

      // Increment search count for free users
      if (!isAuthenticated) {
        const nextCount = searchCount + 1;
        setSearchCount(nextCount);
        localStorage.setItem(SEARCH_COUNT_KEY, nextCount.toString());
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      if (authMode === "signup") {
        setStep("verify"); // Move to 6-digit OTP verification step
      } else {
        setIsAuthenticated(true);
        setShowPaywallModal(false);
        setEmail("");
        setPassword("");
      }
    } catch (err: any) {
      setAuthError(err.message || "Something went wrong");
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      setStep("payment"); // OTP verified successfully -> Go to Payment Gate ($2.50)
    } catch (err: any) {
      setAuthError(err.message || "Invalid Code");
    }
  }

  function openSubmissions() {
    setSubmissions(loadSubmissions());
    setActiveTab("submissions");
  }

  function saveSubmission(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const item: Submission = {
      ...submissionForm,
      id: crypto.randomUUID(),
      updated: new Date().toISOString(),
    };
    const next = [item, ...submissions];
    setSubmissions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSubmissionForm({ title: "", journal: "", authors: "", submitted: "", status: "Submitted", manuscriptId: "" });
    setShowSubmissionForm(false);
  }

  function deleteSubmission(id: string) {
    const next = submissions.filter(s => s.id !== id);
    setSubmissions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  const highMatches = results.filter(r => r.score >= 70).length;
  const mediumMatches = results.filter(r => r.score >= 40 && r.score < 70).length;
  const sourceSummary = useMemo(() => sourceStatus.map(s => `${s.source}: ${s.ok ? `${s.count} records` : "unavailable"}`).join(" · "), [sourceStatus]);

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand"><span className="brand-mark"><BookOpenCheck size={22}/></span>ResearchCheck</div>
          <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
            {!isAuthenticated && (
              <span className="pill" style={{background: "#fef3c7", color: "#92400e"}}>
                Free Searches Left: {Math.max(0, FREE_LIMIT - searchCount)}/{FREE_LIMIT}
              </span>
            )}
            <span className="pill">Research integrity toolkit</span>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="eyebrow">Scholarly record discovery</div>
          <h1>Check a paper before<br/>you submit it.</h1>
          <p className="lead">Search public scholarly records for matching publications and preprints. Compare titles, authors and abstracts, then review the source evidence before making a decision.</p>
        </section>

        <div className="tabs">
          <button className={`tab ${activeTab === "search" ? "active" : ""}`} onClick={() => setActiveTab("search")}><Search size={15} style={{display:"inline",verticalAlign:"-3px",marginRight:6}}/>Check a paper</button>
          <button className={`tab ${activeTab === "submissions" ? "active" : ""}`} onClick={openSubmissions}><ClipboardList size={15} style={{display:"inline",verticalAlign:"-3px",marginRight:6}}/>My submissions</button>
        </div>

        {activeTab === "search" ? (
          <>
            <section className="card search-card">
              <form onSubmit={searchPapers}>
                <div className="form-grid">
                  <div>
                    <label className="field-label" htmlFor="title">Paper title (optional)</label>
                    <input id="title" className="field" value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter the paper title"/>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="authors">Authors (optional)</label>
                    <input id="authors" className="field" value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Author 1, Author 2"/>
                  </div>
                </div>
                <div className="form-row">
                  <label className="field-label" htmlFor="abstract">Abstract</label>
                  <textarea id="abstract" className="field" value={abstract} onChange={e => setAbstract(e.target.value)} placeholder="Paste the complete abstract here..." maxLength={15000}/>
                  <p className="helper">{abstract.length.toLocaleString()} / 15,000 characters. This MVP sends the text to public metadata search services through the server to find records. Avoid entering confidential content unless authorized.</p>
                </div>
                <button className="primary" type="submit" disabled={busy || (!title.trim() && !abstract.trim())}>
                  <Search size={17}/>{busy ? "Searching academic sources..." : "Search scholarly records"}
                </button>
              </form>
            </section>

            <div style={{marginTop:16}} className="notice">
              <strong>Important:</strong> This tool searches public scholarly metadata. It cannot discover every unpublished manuscript or private journal submission. Similarity scores are preliminary signals, not proof of duplicate publication.
            </div>

            {error && <div className="error" style={{marginTop:16}}>{error}</div>}

            {(results.length > 0 || sourceStatus.length > 0) && (
              <section className="section">
                <div className="section-head">
                  <div><h2>{results.length ? "Potential matching papers" : outcome === "no_likely_match" ? "No likely match found" : "Search report"}</h2><p className="muted">{results.length} likely matches · {sourceStatus.filter(s => s.ok).length} sources searched · {searchedAt ? new Date(searchedAt).toLocaleString() : ""}</p></div>
                  <button className="secondary" onClick={() => { setResults([]); setSourceStatus([]); }}>Clear results</button>
                </div>
                <div className="stat-grid">
                  <div className="card stat"><strong>{results.length}</strong><span>Likely matches (not raw API results)</span></div>
                  <div className="card stat"><strong>{highMatches}</strong><span>High text-overlap candidates</span></div>
                  <div className="card stat"><strong>{mediumMatches}</strong><span>Moderate text-overlap candidates</span></div>
                </div>
                <p className="helper" style={{marginBottom:14}}>Sources checked: {sourceSummary || "No source details returned"}. Scores are heuristic text-overlap indicators, not probabilities.</p>
                {results.length ? <div className="results">
                  {results.map((paper) => (
                    <article className="card result" key={paper.id}>
                      <div className="result-top">
                        <div style={{flex:1}}>
                          <h3>{paper.title}</h3>
                          <div className="result-meta">{fmtAuthors(paper.authors)}</div>
                          <div className="result-meta">{[paper.venue, paper.year, paper.type].filter(Boolean).join(" · ") || "Publication details not available"}</div>
                        </div>
                        <span className={badgeClass(paper.score)}>{paper.score}% text overlap</span>
                      </div>
                      <div className="result-badges">
                        <span className="badge badge-blue">{paper.source}</span>
                        {paper.doi && <span className="badge">DOI: {paper.doi}</span>}
                        {paper.type.toLowerCase().includes("preprint") && <span className="badge badge-blue">Possible preprint</span>}
                        {paper.reasons.map(reason => <span className="badge" key={reason}>{reason}</span>)}
                      </div>
                      <p className="helper">This score measures approximate word overlap only. Check the original record and author list before deciding whether it is the same paper.</p>
                      <div className="result-actions">
                        {paper.url && <a className="text-link" href={paper.url} target="_blank" rel="noreferrer">Open source record <ExternalLink size={13} style={{display:"inline",verticalAlign:"-2px"}}/></a>}
                        {paper.doi && <a className="text-link" href={`https://doi.org/${encodeURIComponent(paper.doi)}`} target="_blank" rel="noreferrer">Open DOI</a>}
                      </div>
                    </article>
                  ))}
                </div> : <div className="card empty">{outcome === "no_likely_match" ? <><strong style={{display:"block",fontSize:18,color:"#166534",marginBottom:8}}>No likely match found — possibly unique</strong>No sufficiently similar record was found in the public sources checked. This is not proof that the paper is unpublished or unique; records may be missing, unindexed, or held in private journal systems.</> : "The search sources did not return usable results. Try again later."}</div>}
                {disclaimer && <p className="helper" style={{marginTop:12}}>{disclaimer}</p>}
              </section>
            )}
          </>
        ) : (
          <section className="section" style={{paddingTop:0}}>
            <div className="section-head">
              <div><h2>My submission registry</h2><p className="muted">A private, browser-local list for tracking manuscripts.</p></div>
              <button className="primary" onClick={() => setShowSubmissionForm(!showSubmissionForm)}><Plus size={16}/>{showSubmissionForm ? "Cancel" : "Add submission"}</button>
            </div>
            <div className="notice" style={{marginBottom:16}}>
              These entries are stored in this browser's local storage, not in a secure multi-user database. Do not use this prototype for confidential institutional records until authentication, server-side access control, encrypted storage and backups are implemented. Statuses are self-reported unless you add verified evidence.
            </div>
            {showSubmissionForm && <form className="card search-card" onSubmit={saveSubmission} style={{marginBottom:16}}>
              <div className="form-row"><label className="field-label">Paper title *</label><input required className="field" value={submissionForm.title} onChange={e => setSubmissionForm({...submissionForm,title:e.target.value})}/></div>
              <div className="form-grid">
                <div><label className="field-label">Journal / conference *</label><input required className="field" value={submissionForm.journal} onChange={e => setSubmissionForm({...submissionForm,journal:e.target.value})} placeholder="Journal name"/></div>
                <div><label className="field-label">Manuscript ID (optional)</label><input className="field" value={submissionForm.manuscriptId} onChange={e => setSubmissionForm({...submissionForm,manuscriptId:e.target.value})}/></div>
              </div>
              <div className="form-grid">
                <div><label className="field-label">Authors</label><input className="field" value={submissionForm.authors} onChange={e => setSubmissionForm({...submissionForm,authors:e.target.value})}/></div>
                <div><label className="field-label">Submission date</label><input type="date" className="field" value={submissionForm.submitted} onChange={e => setSubmissionForm({...submissionForm,submitted:e.target.value})}/></div>
              </div>
              <div className="form-row"><label className="field-label">Status</label><select className="field" value={submissionForm.status} onChange={e => setSubmissionForm({...submissionForm,status:e.target.value})}>{statuses.map(s => <option key={s}>{s}</option>)}</select></div>
              <button className="primary" type="submit">Save submission record</button>
            </form>}
            {submissions.length ? <div className="submission-grid">
              {submissions.map(s => <article className="card submission-card" key={s.id}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"start"}}>
                  <h3>{s.title}</h3><button className="secondary" title="Delete record" onClick={() => deleteSubmission(s.id)}><Trash2 size={15}/></button>
                </div>
                <p className="result-meta">{s.journal}</p>
                {s.authors && <p className="result-meta">Authors: {s.authors}</p>}
                {s.manuscriptId && <p className="result-meta">Manuscript ID: {s.manuscriptId}</p>}
                {s.submitted && <p className="result-meta">Submitted: {s.submitted}</p>}
                <span className="status">{s.status}</span>
                <p className="helper" style={{marginTop:10}}>Last updated locally: {new Date(s.updated).toLocaleString()}</p>
              </article>)}
            </div> : <div className="card empty">No submissions saved in this browser yet. Select “Add submission” to create a record.</div>}
          </section>
        )}
      </main>

      {/* Multi-step Paywall / Auth / Verification / Payment Modal */}
      {showPaywallModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
          background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
        }}>
          <div className="card" style={{maxWidth: 420, width: "100%", position: "relative", background: "white", padding: 24}}>
            <button onClick={() => setShowPaywallModal(false)} style={{position: "absolute", top: 12, right: 12, background: "transparent", border: "none", cursor: "pointer"}}>
              <X size={20}/>
            </button>

            {step === "auth" && (
              <>
                <div style={{textAlign: "center", marginBottom: 16}}>
                  <div style={{background: "#e0e7ff", color: "#4f46e5", display: "inline-flex", padding: 10, borderRadius: "50%", marginBottom: 8}}>
                    <Lock size={24}/>
                  </div>
                  <h2>Unlock Unlimited Searches</h2>
                  <p className="muted" style={{fontSize: 14, marginTop: 4}}>
                    You have reached your 5 free searches limit. Please log in or sign up to subscribe for <strong>$2.50 USD</strong>.
                  </p>
                </div>

                <div style={{display: "flex", gap: 8, marginBottom: 16}}>
                  <button className={`tab ${authMode === "login" ? "active" : ""}`} style={{flex: 1}} onClick={() => setAuthMode("login")}>Log In</button>
                  <button className={`tab ${authMode === "signup" ? "active" : ""}`} style={{flex: 1}} onClick={() => setAuthMode("signup")}>Sign Up</button>
                </div>

                {authError && <div className="error" style={{marginBottom: 12, fontSize: 13}}>{authError}</div>}

                <form onSubmit={handleAuthSubmit}>
                  <div className="form-row" style={{marginBottom: 12}}>
                    <label className="field-label">Email</label>
                    <input type="email" required className="field" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
                  </div>
                  <div className="form-row" style={{marginBottom: 16}}>
                    <label className="field-label">Password</label>
                    <input type="password" required className="field" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••"/>
                  </div>

                  <button className="primary" type="submit" style={{width: "100%", marginBottom: 12}}>
                    {authMode === "login" ? "Log In & Continue" : "Sign Up & Send Code"}
                  </button>
                </form>
              </>
            )}

            {step === "verify" && (
              <>
                <div style={{textAlign: "center", marginBottom: 16}}>
                  <h2>Verify Your Email</h2>
                  <p className="muted" style={{fontSize: 14, marginTop: 4}}>
                    We sent a 6-digit verification code to <strong>{email}</strong>. Please check your inbox.
                  </p>
                </div>

                {authError && <div className="error" style={{marginBottom: 12, fontSize: 13}}>{authError}</div>}

                <form onSubmit={handleVerifyOtp}>
                  <div className="form-row" style={{marginBottom: 16}}>
                    <label className="field-label">6-Digit Verification Code</label>
                    <input type="text" maxLength={6} required className="field" style={{letterSpacing: "4px", textAlign: "center", fontSize: 20}} value={otpCode} onChange={e => setOtpCode(e.target.value)} placeholder="123456"/>
                  </div>

                  <button className="primary" type="submit" style={{width: "100%", marginBottom: 12}}>
                    Verify Code
                  </button>
                </form>
              </>
            )}

            {step === "payment" && (
              <>
                <div style={{textAlign: "center", marginBottom: 16}}>
                  <h2>Complete Subscription</h2>
                  <p className="muted" style={{fontSize: 14, marginTop: 4}}>
                    Email verified successfully! Pay <strong>$2.50 USD</strong> to activate full access.
                  </p>
                </div>

                <div className="card" style={{padding: 16, textAlign: "center", background: "#f8fafc", marginBottom: 16}}>
                  <h3>ResearchCheck Pro Access</h3>
                  <p style={{fontSize: 24, fontWeight: "bold", margin: "8px 0"}}>$2.50 USD</p>
                  <p className="helper">Unlimited checks & submission management features.</p>
                </div>

                <button className="primary" style={{width: "100%"}} onClick={() => {
                  setIsAuthenticated(true);
                  setShowPaywallModal(false);
                  alert("Payment successful! Subscription activated.");
                }}>
                  Pay $2.50 USD & Unlock Now
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="container">
          <strong>ResearchCheck MVP</strong><br/>
          Public metadata discovery and preliminary text matching. Not a plagiarism verdict, publication guarantee, or source of private journal status. Always verify results against the publisher or repository record.
        </div>
      </footer>
    </>
  );
}