import { useEffect, useRef, useState, type FormEvent } from "react";
import "./developers.css";

const endpoint = "/api/v1/consumer/games";
export function Developers() {
  const [key, setKey] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("JavaScript");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    document.title = "KnownGDB API · Developer documentation";
    return () => active.current?.abort();
  }, []);
  const url = new URL(endpoint, window.location.origin);
  if (query.trim()) url.searchParams.set("q", query.trim());
  const examples: Record<string, string> = {
    JavaScript: `const response = await fetch(${JSON.stringify(url.href)}, {\n  headers: { Authorization: \`Bearer \${process.env.KNOWNGDB_API_KEY}\` },\n});\nconst body = await response.json();\nif (!response.ok) throw new Error(body.error);\nconsole.log(body.games);`,
    Python: `import os\nimport requests\n\nresponse = requests.get(\n    ${JSON.stringify(url.href)},\n    headers={"Authorization": "Bearer " + os.environ["KNOWNGDB_API_KEY"]},\n    timeout=15,\n)\nresponse.raise_for_status()\nprint(response.json()["games"])`,
    curl: `curl --fail-with-body '${url.href}' \\\n  -H "Authorization: Bearer \${KNOWNGDB_API_KEY}"`,
  };
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${key.trim()}` },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      const text = await response.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* Display non-JSON failures too. */
      }
      setResult({ status: response.status, body });
    } catch {
      if (!controller.signal.aborted)
        setError(
          "The request could not complete. Check your connection and try again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function clear() {
    active.current?.abort();
    setBusy(false);
    setKey("");
    setResult(null);
    setError("");
  }
  return (
    <div className="developer-portal">
      <header className="developer-header">
        <a href="/" className="wordmark">
          Known<span>GDB</span>
        </a>
        <span>Developers · API v1</span>
        <a href="/#/account">Manage API keys ↗</a>
      </header>
      <div className="developer-layout">
        <nav className="developer-index" aria-label="Developer documentation">
          <span>API REFERENCE</span>
          {[
            ["overview", "Overview"],
            ["authentication", "Authentication"],
            ["games", "Search games"],
            ["responses", "Responses & errors"],
            ["examples", "Code examples"],
            ["playground", "API playground"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
          <a href="/">← Back to catalog</a>
        </nav>
        <main className="developer-content">
          <section id="overview">
            <p className="developer-eyebrow">BUILD WITH KNOWNGDB</p>
            <h1>One catalog. Your integration.</h1>
            <p>
              Read published game identities and localized titles through a
              versioned JSON API. Start with a key, make a request, and inspect
              the response here.
            </p>
            <code className="developer-base">
              {window.location.origin}/api/v1
            </code>
            <p>
              <a className="button" href="#playground">
                Try a request
              </a>{" "}
              <a className="button secondary" href="/#/account">
                Get an API key
              </a>
            </p>
          </section>
          <section id="authentication">
            <h2>Authentication</h2>
            <p>
              Create an account, confirm your email if requested, then create a
              consumption key in Account. Copy the full secret when issued; a
              listed key prefix cannot authenticate requests.
            </p>
            <pre>
              <code>Authorization: Bearer YOUR_API_KEY</code>
            </pre>
            <p>
              Keys grant <code>catalog:read</code> access. Expiration is
              optional; revoked keys stop authorizing new requests. Store keys
              in server configuration. This playground keeps your key in memory
              and sends it only to this site's API.
            </p>
          </section>
          <section id="games">
            <h2>Search games</h2>
            <p>
              <strong className="developer-method">GET</strong>{" "}
              <code>{endpoint}</code>
            </p>
            <p>
              Returns approved localized summaries for published games. Omit the
              search to list up to 50 results, ordered by title.
            </p>
            <div className="developer-table">
              <table>
                <thead>
                  <tr>
                    <th>Query parameter</th>
                    <th>Type</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>q</code>
                    </td>
                    <td>string, optional</td>
                    <td>Title search, up to 120 characters.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              No pagination or complete catalog export is available on this
              endpoint.
            </p>
          </section>
          <section id="responses">
            <h2>Responses & errors</h2>
            <pre>
              <code>
                {
                  '{\n  "games": [\n    {\n      "id": "00000000-0000-4000-8000-000000000001",\n      "title": "Example Game",\n      "language": "en",\n      "itemType": "game"\n    }\n  ]\n}'
                }
              </code>
            </pre>
            <p>
              This is an illustrative response. <code>id</code> is an immutable
              KnownGDB UUID, <code>title</code> and <code>language</code>{" "}
              describe the localization, and <code>itemType</code> identifies
              the canonical item type. No matches returns{" "}
              <code>{'{"games":[]}'}</code>.
            </p>
            <div className="developer-table">
              <table>
                <thead>
                  <tr>
                    <th>HTTP</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [200, "Success"],
                    [400, "Invalid search"],
                    [401, "Missing, invalid, expired or revoked API key"],
                    [403, "HTTPS required"],
                    [405, "Unsupported method"],
                    [503, "Service temporarily unavailable"],
                  ].map(([status, meaning]) => (
                    <tr key={status}>
                      <td>{status}</td>
                      <td>{meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Failures return <code>{'{"error":"message"}'}</code>. Retry
              temporary failures with bounded backoff. Operational rate and
              commercial quota contracts are not yet published; avoid unbounded
              concurrent requests.
            </p>
          </section>
          <section id="examples">
            <h2>Code examples</h2>
            <div
              className="developer-languages"
              role="group"
              aria-label="Example language"
            >
              {Object.keys(examples).map((value) => (
                <button
                  key={value}
                  className={language === value ? "" : "secondary"}
                  aria-pressed={language === value}
                  onClick={() => setLanguage(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <pre>
              <code>{examples[language]}</code>
            </pre>
            <p>
              Examples reflect the search entered below. They use placeholders
              or environment variables and never include your entered secret.
            </p>
          </section>
          <section id="playground">
            <h2>API playground</h2>
            <p>
              Make a real read request. Authentication uses only the key you
              enter, independently of your account session.
            </p>
            <form onSubmit={send} autoComplete="off">
              <label>
                API key
                <input
                  type="password"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setResult(null);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={busy}
                  placeholder="Paste the full key"
                />
              </label>
              <label>
                Search title (optional)
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={120}
                  disabled={busy}
                  placeholder="Leave empty to list games"
                />
              </label>
              <code className="developer-base">
                GET {url.pathname}
                {url.search}
              </code>
              <div className="developer-actions">
                <button disabled={busy || !key.trim()}>
                  {busy ? "Sending…" : "Send request"}
                </button>
                <button type="button" className="secondary" onClick={clear}>
                  Clear key & response
                </button>
              </div>
            </form>
            <div role="status" aria-live="polite">
              {error ||
                (result ? `HTTP ${result.status}` : "No request sent yet.")}
            </div>
            {result && (
              <pre aria-label="API response">
                <code>{result.body}</code>
              </pre>
            )}
            <p>
              To verify revocation: send a successful request, revoke the key in{" "}
              <a href="/#/account" target="_blank" rel="noopener noreferrer">
                Account
              </a>
              , then send again. Expect HTTP 401.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
