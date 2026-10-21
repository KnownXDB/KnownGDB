import { useEffect, useRef, useState } from "react";

export function AssetFile({
  versionId,
  label,
  admin = false,
  available,
}: {
  versionId: string;
  label: string;
  admin?: boolean;
  available: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [failedPreview, setFailedPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const downloads = useRef(new Set<string>());
  const base = `/api/v1/${admin ? "admin/" : ""}asset-versions/${encodeURIComponent(versionId)}`;
  useEffect(
    () => () => {
      request.current?.abort();
      for (const url of downloads.current) URL.revokeObjectURL(url);
    },
    [versionId, admin],
  );
  async function download() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${base}/download`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        if (admin && (response.status === 401 || response.status === 403))
          window.dispatchEvent(new Event("knowngdb-session-changed"));
        const data = await response.json().catch(() => null);
        throw Error(data?.error || "Original download is unavailable.");
      }
      if (
        !/^image\/(png|jpeg|x-icon)$/.test(
          response.headers.get("Content-Type") ?? "",
        )
      )
        throw Error("The original response is not a supported image.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      downloads.current.add(url);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([a-f0-9-]+\.(?:png|jpg|ico))"/)?.[1] ??
        "original";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 1000);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Original download is unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (!available)
    return <p>Original delivery is not available for this version.</p>;
  return (
    <div className="asset-file">
      <div className="asset-file-actions">
        <button
          type="button"
          aria-expanded={preview}
          onClick={() => {
            setFailedPreview(false);
            setPreview((value) => !value);
          }}
        >
          {preview ? "Hide preview" : "Show preview"}
        </button>
        <button type="button" disabled={busy} onClick={() => void download()}>
          {busy ? "Downloading…" : "Download original"}
        </button>
      </div>
      {preview ? (
        failedPreview ? (
          <p role="alert">
            Preview unavailable. Refresh the history or sign in again.
          </p>
        ) : (
          <img
            className="asset-preview"
            src={`${base}/preview`}
            alt={`${label} preview`}
            loading="lazy"
            decoding="async"
            onError={() => setFailedPreview(true)}
          />
        )
      ) : null}
      <p role="status" aria-live="polite">
        {error}
      </p>
    </div>
  );
}
