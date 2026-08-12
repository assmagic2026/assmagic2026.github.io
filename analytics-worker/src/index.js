const ALLOWED_ORIGIN = "https://assmagic2026.github.io";
const ENDPOINT_PATH = "/v1/engagement";
const MAX_BODY_BYTES = 1024;
const MIN_SECONDS = 3;
const MAX_SECONDS = 12 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
});

const plainResponse = (status, body, origin = ALLOWED_ORIGIN) => new Response(body, {
  status,
  headers: {
    ...corsHeaders(origin),
    "Content-Type": "text/plain; charset=utf-8",
  },
});

const readBoundedText = async (request) => {
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) throw new RangeError("Payload too large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
};

const parsePayload = async (request) => {
  const raw = await readBoundedText(request);
  const payload = JSON.parse(raw);

  if (payload?.v !== 1) throw new TypeError("Unsupported payload version");
  if (!UUID_PATTERN.test(payload.sessionId)) throw new TypeError("Invalid session ID");
  if (!Number.isInteger(payload.seconds)) throw new TypeError("Invalid duration");
  if (payload.seconds < MIN_SECONDS || payload.seconds > MAX_SECONDS) {
    throw new RangeError("Duration outside accepted range");
  }

  return payload;
};

export const handleRequest = async (request, env) => {
  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return plainResponse(200, "ok");
  }

  if (url.pathname !== ENDPOINT_PATH) return plainResponse(404, "not found");

  const origin = request.headers.get("Origin");
  if (origin !== ALLOWED_ORIGIN) return plainResponse(403, "forbidden");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") return plainResponse(405, "method not allowed", origin);

  try {
    const payload = await parsePayload(request);
    env.ENGAGEMENT.writeDataPoint({
      indexes: ["assmagic2026.github.io"],
      blobs: [payload.sessionId],
      doubles: [payload.seconds],
    });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return plainResponse(400, "invalid payload", origin);
    }
    if (error instanceof RangeError) return plainResponse(413, "payload rejected", origin);
    console.error(JSON.stringify({ message: "engagement event rejected", error: String(error) }));
    return plainResponse(500, "internal error", origin);
  }
};

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
