// Consume Auth fragments before rendering; never persist or log recovery tokens.
const fragment = new URLSearchParams(window.location.hash.slice(1));
export let initialRecovery =
  fragment.get("type") === "recovery"
    ? {
        accessToken: fragment.get("access_token") ?? "",
        refreshToken: fragment.get("refresh_token") ?? "",
        expiresAt:
          Number(fragment.get("expires_at")) ||
          Date.now() / 1000 + Number(fragment.get("expires_in") || 0),
      }
    : null;
export const recoveryError =
  fragment.has("error") || fragment.has("error_code");
export const startsInRecovery = Boolean(
  initialRecovery ||
  recoveryError ||
  new URLSearchParams(window.location.search).get("recovery") === "1",
);
export function clearInitialRecovery() {
  initialRecovery = null;
}

if (
  fragment.has("access_token") ||
  fragment.has("refresh_token") ||
  fragment.has("error") ||
  fragment.has("error_code")
)
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
fragment.delete("access_token");
fragment.delete("refresh_token");
