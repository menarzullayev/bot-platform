// Small HTTP helpers for the Mini App API: JSON responses, typed errors and a capped body reader.

export const MAX_BODY_BYTES = 8 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export function errorResponse(e: HttpError): Response {
  return json({ error: e.code, ...(e.message !== e.code ? { message: e.message } : {}) }, e.status, e.headers);
}

/** Reads and parses a JSON body of at most `max` bytes. 413 / 415 / 400 are thrown as HttpError. */
export async function readJson(req: Request, max = MAX_BODY_BYTES): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, "unsupported_media_type", "content-type must be application/json");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, "payload_too_large");
  if (!req.body) throw new HttpError(400, "invalid_json", "empty body");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "payload_too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(all));
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
