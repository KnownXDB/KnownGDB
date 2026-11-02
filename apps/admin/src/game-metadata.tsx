import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  gameTypes,
  releaseStates,
  termKinds,
  type AdminRole,
  type CatalogTerm,
  type GameMetadata,
  type GameMetadataPage,
  type TermKind,
} from "@knowngdb/contracts";

const empty = (page: GameMetadataPage): GameMetadata => ({
  primaryLanguage: page.baseline?.language ?? "en",
  originalTitle: "",
  gameType: "game",
  localizations: page.baseline?.localizations ?? [
    {
      language: page.baseline?.language ?? "en",
      title: page.baseline?.title ?? "",
      summary: "",
      description: page.baseline?.description ?? "",
      aliases: [],
    },
  ],
  credits: [],
  releases: [],
  languages: [],
  classifications: [],
});
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init),
    data = await response.json();
  if (!response.ok) throw Error(data.error || "Metadata request failed.");
  return data;
}
const post = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
function Group({
  title,
  children,
  onAdd,
  disabled,
  hidden = false,
}: {
  title: string;
  children: ReactNode;
  onAdd: () => void;
  disabled: boolean;
  hidden?: boolean;
}) {
  return (
    <section
      className="metadata-group"
      hidden={hidden}
      data-editor-section={
        title === "Credits" ? "companies" : title.toLowerCase()
      }
    >
      <h4>{title}</h4>
      {children}
      <button type="button" disabled={disabled} onClick={onAdd}>
        Add {title.toLowerCase().replace(/s$/, "")}
      </button>
    </section>
  );
}
export function GameMetadataEditor({
  gameId,
  role,
  onChanged,
  onDirtyChange,
}: {
  gameId: string;
  role: AdminRole;
  onChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [page, setPage] = useState<GameMetadataPage | null>(null),
    [draft, setDraft] = useState<GameMetadata | null>(null),
    [terms, setTerms] = useState<CatalogTerm[]>([]);
  const [source, setSource] = useState(""),
    [confidence, setConfidence] = useState(0),
    [reason, setReason] = useState(""),
    [approvalReason, setApprovalReason] = useState("");
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [section, setSection] = useState("overview");
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const endpoint = `/api/v1/admin/games/${gameId}/metadata`;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setDraft(null);
    setMessage("");
    Promise.all([
      json(endpoint, { signal: controller.signal }),
      json("/api/v1/admin/metadata-terms", { signal: controller.signal }),
    ])
      .then(([p, t]: [GameMetadataPage, { terms: CatalogTerm[] }]) => {
        if (controller.signal.aborted) return;
        setPage(p);
        setDraft(p.revision?.data ?? empty(p));
        setTerms(t.terms);
        setSource(p.revision?.source ?? p.baseline?.source ?? "");
        setConfidence(p.revision?.confidence ?? 0);
        setReason("");
        setApprovalReason("");
        setDirty(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    return () => controller.abort();
  }, [endpoint, refresh]);
  const edit = (change: (d: GameMetadata) => void) => {
    setDraft((old) => {
      if (!old) return old;
      const next = structuredClone(old);
      change(next);
      return next;
    });
    setDirty(true);
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft) return;
    const invalid = (event.currentTarget as HTMLFormElement).querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input:invalid, select:invalid, textarea:invalid");
    if (invalid) {
      const owner =
        invalid.closest<HTMLElement>("[data-editor-section]")?.dataset
          .editorSection ?? "overview";
      setSection(owner === "localizations" ? "overview" : owner);
      setMessage("Complete the highlighted field before saving.");
      requestAnimationFrame(() => {
        invalid.focus();
        invalid.reportValidity();
      });
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await json(
        endpoint,
        post({
          expectedRevisionId: page?.revision?.id ?? null,
          data: {
            ...draft,
            localizations: draft.localizations.map((l) => ({
              ...l,
              aliases: l.aliases.map((a) => a.trim()).filter(Boolean),
            })),
          },
          source,
          confidence,
          reason,
        }),
      );
      setRefresh((v) => v + 1);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  async function approve(event: FormEvent) {
    event.preventDefault();
    if (busy || dirty || !page?.revision) return;
    setBusy(true);
    setMessage("");
    try {
      await json(
        `${endpoint}/approval`,
        post({ expectedRevisionId: page.revision.id, reason: approvalReason }),
      );
      setRefresh((v) => v + 1);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setBusy(false);
    }
  }
  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const result = await json(
        "/api/v1/admin/metadata-terms",
        post({
          kind: data.get("kind"),
          name: data.get("name"),
          source: data.get("source"),
        }),
      );
      setTerms((old) =>
        [...old, result.term].sort((a, b) => a.name.localeCompare(b.name)),
      );
      form.reset();
      setMessage("Catalog entry created. Select it in the appropriate field.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Catalog entry creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const choices = (kind: TermKind) =>
    terms
      .filter((t) => t.kind === kind)
      .map((t) => (
        <option value={t.id} key={t.id}>
          {t.name}
        </option>
      ));
  const releaseChoices = () =>
    draft?.releases.map((r, i) => (
      <option value={r.id} key={r.id}>
        Release {i + 1}:{" "}
        {terms.find((t) => t.id === r.platformId)?.name ?? "Choose platform"} ·{" "}
        {r.region} · {r.edition || "Base"}
      </option>
    ));
  const scope = (
    label: string,
    value: string | null,
    onChange: (id: string | null) => void,
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Whole game</option>
        {releaseChoices()}
      </select>
    </label>
  );
  return (
    <section
      aria-labelledby={`metadata-editor-${gameId}`}
      className="metadata-editor"
    >
      <h2 className="sr-only" id={`metadata-editor-${gameId}`}>
        Game metadata editor
      </h2>
      <nav className="section-tabs editor-tabs" aria-label="Metadata sections">
        {[
          "overview",
          "companies",
          "releases",
          "languages",
          "classification",
          "review",
        ].map((tab) => (
          <button
            type="button"
            key={tab}
            aria-current={section === tab ? "page" : undefined}
            onClick={() => setSection(tab)}
          >
            {tab === "review"
              ? "Review & save"
              : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
      <details className="editor-help">
        <summary>About revisions and approval</summary>
        <p>
          Save a pending revision, then review and approve it separately.
          Existing public metadata remains unchanged until approval. Approval
          does not publish the game or its images.
        </p>
      </details>
      <p role="status" aria-live="polite">
        {message ||
          (!draft
            ? "Loading metadata…"
            : page?.revision
              ? `Revision ${page.revision.sequence} · ${page.revision.status}${dirty ? " · Unsaved changes" : ""}`
              : "No metadata revision yet.")}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            !dirty ||
            window.confirm("Discard unsaved metadata changes and reload?")
          )
            setRefresh((v) => v + 1);
        }}
      >
        Reload metadata
      </button>
      {draft && page ? (
        <>
          <details
            hidden={
              !["companies", "releases", "classification"].includes(section)
            }
          >
            <summary>Create a catalog entry</summary>
            <p>
              Choose existing entries first. Duplicate names require manual
              identity review.
            </p>
            <form
              className="submission-form"
              onSubmit={(e) => void createTerm(e)}
            >
              <fieldset disabled={busy}>
                <label>
                  Entry type
                  <select
                    aria-label="Entry type"
                    name="kind"
                    key={section}
                    defaultValue={
                      section === "releases"
                        ? "platform"
                        : section === "classification"
                          ? "genre"
                          : "organization"
                    }
                  >
                    {termKinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Entry name
                  <input name="name" required maxLength={160} />
                </label>
                <label>
                  Entry source
                  <textarea
                    aria-label="Entry source"
                    name="source"
                    required
                    maxLength={2000}
                  />
                </label>
              </fieldset>
              <button disabled={busy}>Create catalog entry</button>
            </form>
          </details>
          <form
            className="submission-form"
            noValidate
            onSubmit={(e) => void save(e)}
          >
            <fieldset disabled={busy} className="metadata-fields">
              <div
                hidden={section !== "overview"}
                data-editor-section="overview"
                className="metadata-group"
              >
                <h4>Overview</h4>
                <label>
                  Primary title language
                  <input
                    required
                    maxLength={35}
                    value={draft.primaryLanguage}
                    onChange={(e) =>
                      edit((d) => {
                        d.primaryLanguage = e.target.value.toLowerCase();
                      })
                    }
                  />
                </label>
                <label>
                  Original title
                  <input
                    maxLength={300}
                    value={draft.originalTitle}
                    onChange={(e) =>
                      edit((d) => {
                        d.originalTitle = e.target.value;
                      })
                    }
                  />
                </label>
                <label>
                  Game type
                  <select
                    aria-label="Game type"
                    value={draft.gameType}
                    onChange={(e) =>
                      edit((d) => {
                        d.gameType = e.target.value as GameMetadata["gameType"];
                      })
                    }
                  >
                    {gameTypes.map((t) => (
                      <option key={t} value={t}>
                        {t.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <Group
                  title="Localizations"
                  disabled={draft.localizations.length >= 8}
                  onAdd={() =>
                    edit((d) =>
                      d.localizations.push({
                        language: "",
                        title: "",
                        summary: "",
                        description: "",
                        aliases: [],
                      }),
                    )
                  }
                >
                  {draft.localizations.map((l, i) => (
                    <div className="metadata-row" key={i}>
                      <label>
                        Title language {i + 1}
                        <input
                          required
                          value={l.language}
                          maxLength={35}
                          onChange={(e) =>
                            edit((d) => {
                              d.localizations[i].language =
                                e.target.value.toLowerCase();
                            })
                          }
                        />
                      </label>
                      <label>
                        Title {i + 1}
                        <input
                          required
                          maxLength={300}
                          value={l.title}
                          onChange={(e) =>
                            edit((d) => {
                              d.localizations[i].title = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label>
                        Short summary {i + 1}
                        <textarea
                          aria-label={`Short summary ${i + 1}`}
                          maxLength={500}
                          value={l.summary}
                          onChange={(e) =>
                            edit((d) => {
                              d.localizations[i].summary = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label>
                        Long description {i + 1}
                        <textarea
                          aria-label={`Long description ${i + 1}`}
                          rows={5}
                          maxLength={20000}
                          value={l.description}
                          onChange={(e) =>
                            edit((d) => {
                              d.localizations[i].description = e.target.value;
                            })
                          }
                        />
                      </label>
                      <label>
                        Aliases {i + 1} — one per line
                        <textarea
                          aria-label={`Aliases ${i + 1} — one per line`}
                          value={l.aliases.join("\n")}
                          onChange={(e) =>
                            edit((d) => {
                              d.localizations[i].aliases =
                                e.target.value.split("\n");
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        disabled={draft.localizations.length === 1}
                        onClick={() =>
                          edit((d) => {
                            d.localizations.splice(i, 1);
                          })
                        }
                      >
                        Remove localization {i + 1}
                      </button>
                    </div>
                  ))}
                </Group>
              </div>
              <Group
                hidden={section !== "releases"}
                title="Releases"
                disabled={draft.releases.length >= 50}
                onAdd={() =>
                  edit((d) =>
                    d.releases.push({
                      id: crypto.randomUUID(),
                      platformId: "",
                      edition: "",
                      region: "WW",
                      announcedDate: "",
                      releaseDate: "",
                      status: "announced",
                      availability: "unknown",
                      storeUrl: "",
                    }),
                  )
                }
              >
                {draft.releases.map((r, i) => (
                  <div className="metadata-row" key={r.id}>
                    <h5>Release {i + 1}</h5>
                    <label>
                      Platform {i + 1}
                      <select
                        aria-label={`Platform ${i + 1}`}
                        required
                        value={r.platformId}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].platformId = e.target.value;
                          })
                        }
                      >
                        <option value="">Choose platform</option>
                        {choices("platform")}
                      </select>
                    </label>
                    <label>
                      Edition {i + 1}
                      <input
                        maxLength={160}
                        value={r.edition}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].edition = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Region {i + 1} — two-letter country or WW
                      <input
                        required
                        pattern="[A-Z]{2}"
                        maxLength={2}
                        value={r.region}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].region = e.target.value.toUpperCase();
                          })
                        }
                      />
                    </label>
                    <label>
                      Announced date {i + 1}
                      <input
                        placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
                        maxLength={10}
                        value={r.announcedDate}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].announcedDate = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Release date {i + 1}
                      <input
                        placeholder="YYYY, YYYY-MM or YYYY-MM-DD"
                        maxLength={10}
                        value={r.releaseDate}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].releaseDate = e.target.value;
                          })
                        }
                      />
                    </label>
                    <label>
                      Release status {i + 1}
                      <select
                        aria-label={`Release status ${i + 1}`}
                        value={r.status}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].status = e.target
                              .value as typeof r.status;
                          })
                        }
                      >
                        {releaseStates.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Availability {i + 1}
                      <select
                        aria-label={`Availability ${i + 1}`}
                        value={r.availability}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].availability = e.target
                              .value as typeof r.availability;
                          })
                        }
                      >
                        {[
                          "unknown",
                          "available",
                          "delisted",
                          "service_ended",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Store URL {i + 1}
                      <input
                        type="url"
                        maxLength={2000}
                        value={r.storeUrl}
                        onChange={(e) =>
                          edit((d) => {
                            d.releases[i].storeUrl = e.target.value;
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        edit((d) => {
                          d.releases.splice(i, 1);
                          d.credits = d.credits.filter(
                            (c) => c.releaseId !== r.id,
                          );
                          d.languages = d.languages.filter(
                            (l) => l.releaseId !== r.id,
                          );
                        })
                      }
                    >
                      Remove release {i + 1} and its scoped credits/languages
                    </button>
                  </div>
                ))}
              </Group>
              <p hidden={section !== "releases"}>
                Leave dates blank when unknown. Year-only dates retain their
                precision. Removing a release also removes its scoped credits
                and languages from this pending edit.
              </p>
              <Group
                hidden={section !== "companies"}
                title="Credits"
                disabled={draft.credits.length >= 50}
                onAdd={() =>
                  edit((d) =>
                    d.credits.push({
                      organizationId: "",
                      role: "developer",
                      releaseId: null,
                      region: null,
                    }),
                  )
                }
              >
                {draft.credits.map((c, i) => (
                  <div className="metadata-row" key={i}>
                    <label>
                      Organization {i + 1}
                      <select
                        aria-label={`Organization ${i + 1}`}
                        required
                        value={c.organizationId}
                        onChange={(e) =>
                          edit((d) => {
                            d.credits[i].organizationId = e.target.value;
                          })
                        }
                      >
                        <option value="">Choose organization</option>
                        {choices("organization")}
                      </select>
                    </label>
                    <label>
                      Company role {i + 1}
                      <select
                        aria-label={`Company role ${i + 1}`}
                        value={c.role}
                        onChange={(e) =>
                          edit((d) => {
                            d.credits[i].role = e.target.value as typeof c.role;
                          })
                        }
                      >
                        {[
                          "developer",
                          "publisher",
                          "support",
                          "porting",
                          "distributor",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    {scope(`Credit scope ${i + 1}`, c.releaseId, (id) =>
                      edit((d) => {
                        d.credits[i].releaseId = id;
                      }),
                    )}
                    <label>
                      Credit region {i + 1} — blank for unspecified
                      <input
                        maxLength={2}
                        pattern="[A-Z]{2}"
                        value={c.region ?? ""}
                        onChange={(e) =>
                          edit((d) => {
                            d.credits[i].region =
                              e.target.value.toUpperCase() || null;
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        edit((d) => {
                          d.credits.splice(i, 1);
                        })
                      }
                    >
                      Remove credit {i + 1}
                    </button>
                  </div>
                ))}
              </Group>
              <Group
                hidden={section !== "languages"}
                title="Languages"
                disabled={draft.languages.length >= 100}
                onAdd={() =>
                  edit((d) =>
                    d.languages.push({
                      language: "",
                      releaseId: null,
                      interface: null,
                      subtitles: null,
                      audio: null,
                    }),
                  )
                }
              >
                {draft.languages.map((l, i) => (
                  <div className="metadata-row" key={i}>
                    <label>
                      Supported language {i + 1}
                      <input
                        required
                        maxLength={35}
                        value={l.language}
                        onChange={(e) =>
                          edit((d) => {
                            d.languages[i].language =
                              e.target.value.toLowerCase();
                          })
                        }
                      />
                    </label>
                    {scope(`Language scope ${i + 1}`, l.releaseId, (id) =>
                      edit((d) => {
                        d.languages[i].releaseId = id;
                      }),
                    )}
                    {(["interface", "subtitles", "audio"] as const).map((k) => (
                      <label key={k}>
                        {k} support {i + 1}
                        <select
                          aria-label={`${k} support ${i + 1}`}
                          value={l[k] === null ? "unknown" : String(l[k])}
                          onChange={(e) =>
                            edit((d) => {
                              d.languages[i][k] =
                                e.target.value === "unknown"
                                  ? null
                                  : e.target.value === "true";
                            })
                          }
                        >
                          <option value="unknown">Unknown</option>
                          <option value="true">Supported</option>
                          <option value="false">Not supported</option>
                        </select>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        edit((d) => {
                          d.languages.splice(i, 1);
                        })
                      }
                    >
                      Remove language {i + 1}
                    </button>
                  </div>
                ))}
              </Group>
              <div
                hidden={section !== "classification"}
                data-editor-section="classification"
                className="metadata-group"
              >
                <h4>Classification</h4>
                <p>Use Ctrl or Command to select multiple entries.</p>
                {(["genre", "theme", "perspective", "mode"] as const).map(
                  (kind) => (
                    <label key={kind}>
                      {kind}
                      <select
                        aria-label={kind}
                        multiple
                        size={4}
                        value={draft.classifications.filter(
                          (id) => terms.find((t) => t.id === id)?.kind === kind,
                        )}
                        onChange={(e) => {
                          const selected = Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          );
                          edit((d) => {
                            d.classifications = [
                              ...d.classifications.filter(
                                (id) =>
                                  terms.find((t) => t.id === id)?.kind !== kind,
                              ),
                              ...selected,
                            ];
                          });
                        }}
                      >
                        {choices(kind)}
                      </select>
                    </label>
                  ),
                )}
              </div>
              <div
                hidden={section !== "review"}
                data-editor-section="review"
                className="metadata-group"
              >
                <h4>Evidence and audit</h4>
                <p>
                  Review your changes: {draft.localizations.length} localized
                  titles, {draft.credits.length} company credits,{" "}
                  {draft.releases.length} releases and {draft.languages.length}{" "}
                  language records.
                </p>
                <p>
                  The source and confidence apply to this revision's facts. Use
                  source references that identify the relevant release, region
                  and language evidence; do not paste credentials or private
                  contact information.
                </p>
                <label>
                  Metadata source evidence
                  <textarea
                    aria-label="Metadata source evidence"
                    required
                    maxLength={2000}
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Evidence confidence
                  <input
                    type="number"
                    required
                    min={0}
                    max={1}
                    step={0.001}
                    value={confidence}
                    onChange={(e) => {
                      setConfidence(Number(e.target.value));
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Reason for metadata change
                  <textarea
                    aria-label="Reason for metadata change"
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </div>
            </fieldset>
            <div className="editor-actions">
              <span>
                {dirty
                  ? "Unsaved changes"
                  : (page.revision?.status ?? "New revision")}
              </span>
              <button disabled={busy}>Save pending revision</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setSection("review")}
              >
                Review saved revision
              </button>
            </div>
          </form>
          {role === "super_admin" && page.revision?.status === "pending" ? (
            <form
              className="publication-form surface"
              hidden={section !== "review"}
              onSubmit={(e) => void approve(e)}
            >
              <label>
                Metadata approval reason
                <textarea
                  aria-label="Metadata approval reason"
                  required
                  maxLength={2000}
                  disabled={busy || dirty}
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                />
              </label>
              <button disabled={busy || dirty}>Approve saved metadata</button>
              {dirty ? (
                <p>
                  Save or discard unsaved changes before reviewing the saved
                  revision.
                </p>
              ) : null}
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
