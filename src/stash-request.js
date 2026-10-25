// Preserve Loon's optimizeRequest path and extend transport-only relay to replies.
j.prototype.createRequest = stashObject;
j.prototype.createResponse = stashObject;
j.prototype.done = stashDone;
F.prototype.onerror = function(error) {
  this.state.type = error instanceof $ ? "abort" : "exit";
  if (!(error instanceof A) || error.code !== 0) B.error(String(error));
};
W = stashGunzip;
v = stashFraming;
lt = stashGrpcStatus;
tt = async (context, next) => {
  if (context.argument.optimizeRequest === false) ue();
  // Retain status, binary body, headers and any trailers supplied by Stash.
  context.response = stashObject(await Wt(context));
  return next();
};

const STASH_SB_KEY = "bili.stash.sponsor.v1";
function stashCacheRead() {
  try {
    const cache = JSON.parse($persistentStore.read(STASH_SB_KEY) || "{}");
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) return {};
    const entries = cache.entries && typeof cache.entries === "object" && !Array.isArray(cache.entries) ? cache.entries : {};
    const valid = value => value && typeof value === "object" && Number.isFinite(value.until)
      && Array.isArray(value.segments) && value.segments.length <= 100
      && value.segments.every(pair => Array.isArray(pair) && pair.length === 2
        && pair.every(Number.isFinite) && pair[0] >= 0 && pair[1] - pair[0] >= 8 && pair[1] * 1000 <= 2147483647);
    const pending = cache.pending && typeof cache.pending.key === "string"
      && typeof cache.pending.token === "string" && Number.isFinite(cache.pending.until) ? cache.pending : undefined;
    return { pending, retryAfter: Number.isFinite(cache.retryAfter) ? cache.retryAfter : 0,
      entries: Object.fromEntries(Object.entries(entries).filter(([,value]) => valid(value))) };
  } catch (_) { return {}; }
}
function stashCacheWrite(cache) {
  try { $persistentStore.write(JSON.stringify(cache), STASH_SB_KEY); } catch (_) {}
}
function stashValidSegments(body) {
  const data = JSON.parse(body);
  if (!Array.isArray(data)) throw new Error("Unexpected SponsorBlock response");
  const segments = [];
  for (const item of data) {
    const pair = item && item.segment;
    if (item?.actionType !== "skip" || !Array.isArray(pair) || pair.length !== 2) continue;
    const [start, end] = pair;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end - start < 8 || end * 1000 > 2147483647) continue;
    if (!segments.some(s => s[0] === start && s[1] === end)) segments.push([start, end]);
    if (segments.length === 100) break;
  }
  return segments.sort((a, b) => a[0] - b[0]);
}
function stashSponsor(context, bvid, cid) {
  const key = bvid + ":" + cid;
  const now = Date.now();
  const cache = stashCacheRead();
  const entries = cache.entries || {};
  const hit = entries[key];
  if (hit && hit.until > now && Array.isArray(hit.segments)) return Promise.resolve(hit.segments);
  if (cache.retryAfter > now) return Promise.resolve([]);
  // Best-effort cross-invocation lease: concurrent responses skip enrichment
  // instead of queuing another service call. Persistent storage is not atomic.
  if (cache.pending && cache.pending.until > now) return Promise.resolve([]);
  const token = now + ":" + Math.random();
  stashCacheWrite({ ...cache, pending: { key, token, until: now + 1000 } });
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = (segments, failure) => {
      if (settled) return;
      settled = true;
      if (typeof clearTimeout === "function") clearTimeout(timer);
      // Merge the newest cache to avoid overwriting concurrent segment results.
      const latest = stashCacheRead();
      const all = latest.entries && typeof latest.entries === "object" ? latest.entries : {};
      // A failed/empty older lookup must not replace a newer positive result.
      const newerHit = !segments.length && all[key]?.until > Date.now() && all[key].segments.length ? all[key] : null;
      if (newerHit) segments = newerHit.segments;
      const expiry = newerHit ? newerHit.until : Date.now() + (failure ? 60000 : segments.length ? 21600000 : 600000);
      all[key] = { until: expiry, segments };
      const kept = Object.entries(all).filter(([,v]) => v.until > Date.now()).sort((a,b) => b[1].until - a[1].until).slice(0,64);
      stashCacheWrite({ pending: latest.pending?.token === token ? undefined : latest.pending,
        retryAfter: failure ? Date.now() + 30000 : latest.retryAfter || 0, entries: Object.fromEntries(kept) });
      resolve(segments);
    };
    // The guard also covers hosts/runtimes that do not honor the client timeout.
    timer = setTimeout(() => finish([], true), 250);
    context.fetch({
      method: "get",
      url: `https://bsbsb.top/api/skipSegments?videoID=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid === "0" ? "" : cid)}&category=sponsor`,
      headers: { origin: "https://github.com/kokoryh/Sparkle/blob/master/release/surge/module/bilibili.sgmodule", "x-ext-version": "1.0.0" },
      timeout: 0.2,
      "auto-cookie": false
    }).then(response => {
      if (response.status === 404) return finish([], false);
      if (response.status !== 200 || typeof response.body !== "string" || response.body.length > 131072) return finish([], true);
      try { finish(stashValidSegments(response.body), false); } catch (_) { finish([], true); }
    }, () => finish([], true));
  });
}

// DmSegMobile is no longer relayed through $httpClient. Its request phase only
// carries per-request identity into the matching response hook. Stash does not
// document request.body in response scripts; request.headers is documented.
// This header (IDs already present in the protobuf body) is sent to Bilibili.
const STASH_DM_HEADER = "x-stash-bili-airborne-context";
const STASH_DM_PATH = /^https:\/\/(?:grpc\.biliapi\.net|app\.bilibili\.com)\/bilibili\.community\.service\.dm\.v1\.DM\/DmSegMobile$/;
function stashDmIdentity(value) {
  const parts = String(value || "").split(":");
  if (parts.length !== 4 || parts[0] !== "1") return null;
  for (const part of parts.slice(1)) {
    if (!/^[1-9][0-9]{0,18}$/.test(part) || BigInt(part) > 9223372036854775807n) return null;
  }
  const index = Number(parts[3]);
  if (!Number.isSafeInteger(index) || index > 5966) return null;
  return { pid: parts[1], cid: parts[2], index };
}
function stashDmEnabled() {
  try {
    const args = typeof $argument === "string" ? JSON.parse($argument) : {};
    return args.sponsorBlock !== false && args.sponsorBlock !== "#";
  } catch (_) { return false; }
}
function stashDmRequest() {
  const headers = { ...($request.headers || {}) };
  let removed = false;
  for (const key of Object.keys(headers)) if (key.toLowerCase() === STASH_DM_HEADER) { delete headers[key]; removed = true; }
  try {
    if (stashDmEnabled()) {
      const req = St.fromBinary(stashUnframe($request.body, headers));
      const identity = stashDmIdentity(`1:${req.pid}:${req.oid}:${req.segmentIndex}`);
      if (req.type === 1 && identity) {
        headers[STASH_DM_HEADER] = `1:${identity.pid}:${identity.cid}:${identity.index}`;
        return $done({ headers });
      }
    }
  } catch (_) {}
  return $done(removed ? { headers } : {});
}
async function stashDmResponse() {
  let output = {};
  try {
    const identity = stashDmIdentity(stashHeader($request.headers, STASH_DM_HEADER));
    if (!stashDmEnabled() || !identity || Number($response.status) !== 200) return $done({});
    const trailerStatus = stashHeader($response.h2_trailers, "grpc-status");
    if (trailerStatus !== undefined && String(trailerStatus) !== "0") return $done({});
    const status = stashHeader($response.headers, "grpc-status");
    if (status !== undefined && String(status) !== "0") return $done({});
    const body = $response.body;
    if (!(body instanceof Uint8Array) || body.length < 5 || ![0, 1].includes(body[0])
      || new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(1, false) !== body.length - 5) return $done({});
    const context = F.createInstance();
    const segments = await stashSponsor(context, le(identity.pid), identity.cid);
    const start = (identity.index - 1) * 360000;
    const end = identity.index * 360000;
    const candidates = nn(segments).filter(item => item.progress >= start && item.progress < end);
    if (!candidates.length) return $done({});
    // Most responses have nothing to inject. Do not inflate/decode/reserialize
    // ordinary danmaku unless a marker belongs in this exact segment.
    const message = _e.fromBinary(stashUnframe(body, $response.headers));
    const additions = candidates.filter(item =>
      !message.elems.some(existing => existing.action === item.action && existing.progress === item.progress));
    if (additions.length) {
      message.elems.push(...additions);
      const response = stashObject({ ...$response, body: stashFrame(_e.toBinary(message)) });
      await stashGrpcStatus({ request: $request, response }, async () => {});
      output = stashResponse(response);
    }
  } catch (_) {
    // Unsupported wire data, missing correlation, or service errors fail open.
  }
  return $done(output);
}

// Rebuild the routes because the upstream router stored the original functions.
M = new _({ matchPath: ft });
M.post("viewunite.v1.View/View", tt, v, Vt);
M.post("v1.Reply/MainList", tt, v, Lt);
// Nested reply schemas differ from MainList. Relay their exact body bytes;
// applying Lt or the MainList framing/codec pipeline could lose reply data.
M.post("v1.Reply/DetailList", tt);
M.post("v1.Reply/DialogList", tt);
nt = new q;
nt.use(st).use(lt).use(at).use(M.routes()).use(M.routeNotMatched());
const stashLoonRun = nt.run.bind(nt);
nt.run = function () {
  if (typeof $request === "object" && $request && STASH_DM_PATH.test($request.url)) {
    if (typeof $response === "object" && $response) return stashDmResponse();
    return stashDmRequest();
  }
  return stashLoonRun();
};
