import { useEffect, useState } from "react";
import type { CatalogTerm, GameMetadata } from "@knowngdb/contracts";

export function PublishedGameMetadata({
  gameId,
  language,
}: {
  gameId: string;
  language: string;
}) {
  const [data, setData] = useState<{
    data: GameMetadata;
    terms: CatalogTerm[];
  } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setMessage("");
    fetch(`/api/v1/games/${gameId}/metadata`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setMessage("No reviewed game metadata is available yet.");
          return;
        }
        if (!response.ok)
          throw Error("Game information is temporarily unavailable.");
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    return () => controller.abort();
  }, [gameId]);
  if (!data)
    return <p role="status">{message || "Loading game information…"}</p>;
  const localized =
    data.data.localizations.find((l) => l.language === language) ??
    data.data.localizations.find(
      (l) => l.language === data.data.primaryLanguage,
    );
  const name = (id: string) =>
    data.terms.find((t) => t.id === id)?.name ?? "Unknown";
  const years = data.data.releases
    .filter(
      (r) => ["released", "early_access"].includes(r.status) && r.releaseDate,
    )
    .map((r) => Number(r.releaseDate.slice(0, 4)));
  const support = (v: boolean | null) =>
    v === null ? "Unknown" : v ? "Supported" : "Not supported";
  return (
    <section aria-label="Reviewed game information">
      <h3>Game information</h3>
      <p>Information language: {localized?.language ?? "Unknown"}</p>
      {localized?.summary ? <p>{localized.summary}</p> : null}
      {localized?.description ? (
        <p style={{ whiteSpace: "pre-wrap" }}>{localized.description}</p>
      ) : null}
      <dl>
        <dt>Type</dt>
        <dd>{data.data.gameType.replaceAll("_", " ")}</dd>
        <dt>First release year</dt>
        <dd>{years.length ? Math.min(...years) : "Unknown"}</dd>
      </dl>
      {data.data.credits.length ? (
        <>
          <h4>Developers and publishers</h4>
          <ul>
            {data.data.credits.map((c, i) => (
              <li key={i}>
                {name(c.organizationId)} · {c.role}
                {c.region ? ` · ${c.region}` : ""}
                {c.releaseId
                  ? ` · ${name(data.data.releases.find((r) => r.id === c.releaseId)?.platformId ?? "")}`
                  : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.data.releases.length ? (
        <>
          <h4>Releases</h4>
          <ul>
            {data.data.releases.map((r) => (
              <li key={r.id}>
                {name(r.platformId)} · {r.edition || "Base"} · {r.region} ·{" "}
                {r.releaseDate || "Date unknown"} ·{" "}
                {r.status.replaceAll("_", " ")} ·{" "}
                {r.availability.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.data.languages.length ? (
        <>
          <h4>Language support</h4>
          <ul>
            {data.data.languages.map((l, i) => (
              <li key={i}>
                {l.language} · Interface: {support(l.interface)} · Subtitles:{" "}
                {support(l.subtitles)} · Audio: {support(l.audio)}
                {l.releaseId
                  ? ` · ${name(data.data.releases.find((r) => r.id === l.releaseId)?.platformId ?? "")}`
                  : " · Whole game"}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.data.classifications.length ? (
        <>
          <h4>Classification</h4>
          <ul>
            {data.data.classifications.map((id) => (
              <li key={id}>
                {data.terms.find((t) => t.id === id)?.kind}: {name(id)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
