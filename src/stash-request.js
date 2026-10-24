// Preserve Loon's optimizeRequest path for View/MainList as well as SponsorBlock.
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
    return { retryAfter: Number.isFinite(cache.retryAfter) ? cache.retryAfter : 0,
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
      const expiry = Date.now() + (failure ? 60000 : segments.length ? 21600000 : 600000);
      all[key] = { until: expiry, segments };
      const kept = Object.entries(all).filter(([,v]) => v.until > Date.now()).sort((a,b) => b[1].until - a[1].until).slice(0,64);
      stashCacheWrite({ retryAfter: failure ? Date.now() + 30000 : latest.retryAfter || 0, entries: Object.fromEntries(kept) });
      resolve(segments);
    };
    // The guard also covers hosts/runtimes that do not honor the client timeout.
    timer = setTimeout(() => finish([], true), 1200);
    context.fetch({
      method: "get",
      url: `https://bsbsb.top/api/skipSegments?videoID=${encodeURIComponent(bvid)}&cid=${encodeURIComponent(cid === "0" ? "" : cid)}&category=sponsor`,
      headers: { origin: "https://github.com/kokoryh/Sparkle/blob/master/release/surge/module/bilibili.sgmodule", "x-ext-version": "1.0.0" },
      timeout: 1
    }).then(response => {
      if (response.status === 404) return finish([], false);
      if (response.status !== 200 || typeof response.body !== "string" || response.body.length > 131072) return finish([], true);
      try { finish(stashValidSegments(response.body), false); } catch (_) { finish([], true); }
    }, () => finish([], true));
  });
}

// Replace only the SponsorBlock route. Unsupported requests and empty/error
// results immediately resume the original app request with $done({}).
Ct = async (context, next) => {
  if (context.argument.sponsorBlock === false) ue();
  const request = St.fromBinary(stashUnframe(context.request.bodyBytes, context.request.headers));
  if (request.type !== 1 || request.pid === "0" || request.oid === "0") ue();
  const segments = await stashSponsor(context, le(request.pid), request.oid);
  if (!segments.length) ue();
  const response = await Wt(context, 1);
  context.response = stashObject(response);
  context.state.segments = segments;
  await next();
};

// Rebuild the routes because the upstream router stored the original functions.
M = new _({ matchPath: ft });
M.post("v1.DM/DmSegMobile", Ct, v, $t);
M.post("viewunite.v1.View/View", tt, v, Vt);
M.post("v1.Reply/MainList", tt, v, Lt);
nt = new q;
nt.use(st).use(lt).use(at).use(M.routes()).use(M.routeNotMatched());
