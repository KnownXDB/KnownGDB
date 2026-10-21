export const bodyLimit = 4096;
export const isJsonRequest = (request: Request) =>
  /^application\/json(?:\s*;|$)/i.test(
    request.headers.get("Content-Type") ?? "",
  );
const failure = (error: string, status: number) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );

// Apply the same bound before allocation in local and hosted Fetch adapters.
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  if (!isJsonRequest(request)) return failure("JSON body required.", 415);
  const advertised = request.headers.get("Content-Length");
  if (
    advertised &&
    /^\d+$/.test(advertised) &&
    Number(advertised) > bodyLimit
  ) {
    await request.body?.cancel().catch(() => {});
    return failure("Request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return failure("Invalid JSON.", 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > bodyLimit) {
        await reader.cancel().catch(() => {});
        return failure("Request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
    const body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
    if (!body || Array.isArray(body) || typeof body !== "object")
      return failure("Invalid body.", 400);
    return body;
  } catch {
    return failure("Invalid JSON.", 400);
  } finally {
    reader.releaseLock();
  }
}
