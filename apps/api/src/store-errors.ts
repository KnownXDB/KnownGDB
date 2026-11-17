export type StoreObservationErrorCode =
  | "identifier_not_found"
  | "provider_access_denied"
  | "provider_error"
  | "invalid_identifier";

export class OfficialStoreResponseError extends Error {
  constructor(
    readonly provider: string,
    readonly providerStatus: number,
  ) {
    super(`${provider} returned HTTP ${providerStatus}.`);
    this.name = "OfficialStoreResponseError";
  }
}

export function storePreviewFailure(
  error: unknown,
  provider: string,
  fallback: string,
) {
  if (error instanceof OfficialStoreResponseError) {
    if ([404, 410].includes(error.providerStatus))
      return {
        status: 502,
        body: {
          error: `${provider} could not find an active official page for this identifier (HTTP ${error.providerStatus}). Verify the identifier and its regional listing.`,
          code: "identifier_not_found" as const,
          providerStatus: error.providerStatus,
        },
      };
    if ([401, 403].includes(error.providerStatus))
      return {
        status: 502,
        body: {
          error: `${provider} rejected the server-side request (HTTP ${error.providerStatus}). The identifier may still be valid; retry later or use an approved provider access method.`,
          code: "provider_access_denied" as const,
          providerStatus: error.providerStatus,
        },
      };
    return {
      status: 502,
      body: {
        error: `${provider} returned an unexpected HTTP response (${error.providerStatus}).`,
        code: "provider_error" as const,
        providerStatus: error.providerStatus,
      },
    };
  }
  if (error instanceof Error && /^Invalid .+\.$/.test(error.message))
    return {
      status: 400,
      body: { error: error.message, code: "invalid_identifier" as const },
    };
  return {
    status: 502,
    body: {
      error: error instanceof Error ? error.message : fallback,
      code: "provider_error" as const,
    },
  };
}
