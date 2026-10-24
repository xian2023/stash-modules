// Stash adapter, modified 2026-10-24. GPL-3.0; upstream: kokoryh/Sparkle.
// Keep the upstream wire schema; adapt only framing and host APIs.
if (!Object.hasOwn) Object.hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function stashObject(value) {
  return Object.defineProperty({ ...(value || {}) }, "bodyBytes", {
    get() { return this.body; },
    set(value) { this.body = value; }
  });
}
function stashHeader(headers, key) {
  const entry = Object.keys(headers || {}).find(k => k.toLowerCase() === key);
  return entry === undefined ? undefined : headers[entry];
}
function stashResponse(value) {
  const headers = {};
  for (const [key, val] of Object.entries(value.headers || {})) {
    if (!["content-length", "content-encoding", "transfer-encoding", "grpc-encoding", "grpc-status", "grpc-message", "grpc-status-details-bin"].includes(key.toLowerCase())) headers[key] = val;
  }
  const body = value.body;
  if (body instanceof Uint8Array && body.length >= 5) {
    headers["grpc-encoding"] = body[0] === 0 ? "identity" : (stashHeader(value.headers, "grpc-encoding") || "gzip");
  }
  for (const name of ["grpc-status", "grpc-message", "grpc-status-details-bin"]) {
    const trailer = stashHeader(value.h2_trailers, name) ?? stashHeader(value.headers, name);
    if (trailer !== undefined) headers[name] = String(trailer);
  }
  return { status: value.status ?? value.statusCode ?? 200, headers, body };
}
async function stashGrpcStatus(context, next) {
  await next();
  // Mirror Loon's engine-type=1 success-header workaround, with case-insensitive
  // lookup. A supplied status (especially an error) must never be overwritten.
  if (stashHeader(context.response.h2_trailers, "grpc-status") !== undefined) return;
  if (stashHeader(context.response.headers, "grpc-status") !== undefined) return;
  if (String(stashHeader(context.request.headers, "x-bili-moss-engine-type")) !== "1") return;
  context.response.headers = { ...(context.response.headers || {}), "grpc-status": "0" };
}
function stashDone(value) {
  if (value.response) return $done({ response: stashResponse(value.response) });
  return $done(stashResponse(value));
}
function stashGunzip(bytes) {
  // fflate's UMD build is bundled locally. No undocumented $utils dependency.
  if (bytes.length < 18) throw new Error("Truncated gzip body");
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(bytes.length - 4, true);
  if (size > 4 * 1024 * 1024) throw new Error("Inflated body exceeds 4 MiB");
  const result = fflate.gunzipSync(bytes);
  if (result.length > 4 * 1024 * 1024) throw new Error("Inflated body exceeds 4 MiB");
  return result;
}
function stashUnframe(bytes, headers) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5) throw new Error("Invalid gRPC body");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, false);
  // Unary messages only. Preserve unknown/streaming/trailer-frame formats by failing open.
  if (length !== bytes.length - 5 || ![0, 1].includes(bytes[0])) throw new Error("Unsupported gRPC framing");
  const status = stashHeader(headers, "grpc-status");
  if (status !== undefined && String(status) !== "0") throw new Error("Non-success gRPC status");
  if (!bytes[0]) return bytes.subarray(5);
  const encoding = stashHeader(headers, "grpc-encoding");
  if (encoding && String(encoding).toLowerCase() !== "gzip") throw new Error("Unsupported gRPC compression");
  return stashGunzip(bytes.subarray(5));
}
function stashFrame(bytes) {
  const framed = new Uint8Array(5 + bytes.length);
  new DataView(framed.buffer).setUint32(1, bytes.length, false);
  framed.set(bytes, 5);
  return framed;
}
async function stashFraming(context, next) {
  const trailerStatus = stashHeader(context.response.h2_trailers, "grpc-status");
  if (trailerStatus !== undefined && String(trailerStatus) !== "0") throw new Error("Non-success gRPC trailer");
  context.response.bodyBytes = stashUnframe(context.response.bodyBytes, context.response.headers);
  await next();
  context.response.bodyBytes = stashFrame(context.response.bodyBytes);
}
