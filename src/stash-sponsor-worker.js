// Standalone synthetic GET endpoint. No request body, original HTTP relay,
// account API, cookies, authorization, logs or notifications are used.
(() => {
  const KEY = "bili.stash.sponsor.v2";
  let completed = false;
  function done(segments) {
    if (completed) return;
    completed = true;
    $done({ response: { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(segments) } });
  }
  function pairs(input) {
    if (!Array.isArray(input)) throw new Error("array required");
    const result = [];
    for (const pair of input) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const [start, end] = pair;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 8 || end * 1000 > 2147483647) continue;
      if (!result.some(p => p[0] === start && p[1] === end)) result.push([start, end]);
    }
    return result.sort((a,b) => a[0]-b[0] || a[1]-b[1]).slice(0,100);
  }
  function boundedBody(body) {
    if (typeof body !== "string" || body.length > 131072) return false;
    let bytes = 0;
    for (const char of body) {
      const point = char.codePointAt(0);
      bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
      if (bytes > 131072) return false;
    }
    return true;
  }
  function read() {
    const raw = $persistentStore.read(KEY);
    let data;
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
    if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
    if (data.entries !== undefined && (!data.entries || typeof data.entries !== "object" || Array.isArray(data.entries))) data = {};
    const entries = {};
    const storedEntries = data.entries && typeof data.entries === "object" && !Array.isArray(data.entries) ? data.entries : {};
    for (const [key, value] of Object.entries(storedEntries)) {
      if (!value || !Number.isFinite(value.until) || !Array.isArray(value.segments) || value.segments.length > 100) continue;
      const valid = pairs(value.segments);
      if (valid.length !== value.segments.length) continue;
      entries[key] = { until: value.until, segments: valid };
    }
    const pending = data.pending && typeof data.pending.key === "string" && typeof data.pending.token === "string" && Number.isFinite(data.pending.until) ? data.pending : undefined;
    return { entries, retryAfter: Number.isFinite(data.retryAfter) ? data.retryAfter : 0, pending };
  }
  function write(data) {
    if ($persistentStore.write(JSON.stringify(data), KEY) === false) throw new Error("write failed");
  }
  // AV->BV algorithm copied from upstream/scripts/proto_request.js le(),
  // kokoryh/Sparkle, retained under repository third-party notices.
  function bvid(aid) {
    const table = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
    const chars = ["B","V","1","0","0","0","0","0","0","0","0","0"];
    let value = ((1n << 51n) | BigInt(aid)) ^ 23442827791579n, index = 11;
    while (value > 0n) { chars[index--] = table[Number(value % 58n)]; value /= 58n; }
    [chars[3],chars[9]]=[chars[9],chars[3]];
    [chars[4],chars[7]]=[chars[7],chars[4]];
    return chars.join("");
  }
  try {
    const match = /^https:\/\/api\.bilibili\.com\/x\/stash-airborne\/segments\?aid=([1-9][0-9]{0,15})&cid=([1-9][0-9]{0,18})$/.exec($request.url);
    if ($request.method !== "GET" || !match || BigInt(match[1]) >= (1n << 51n) || BigInt(match[2]) > 9223372036854775807n) return done([]);
    const video = bvid(match[1]), cid = match[2], key = video + ":" + cid, now = Date.now();
    const cache = read(), hit = cache.entries[key];
    if (hit && hit.until > now) return done(hit.segments);
    if (cache.retryAfter > now || (cache.pending && cache.pending.key === key && cache.pending.until > now)) return done([]);
    const token = now + ":" + Math.random();
    write({ ...cache, pending: { key, token, until: now + 1500 } });
    let settled = false, timer;
    function finish(segments, failure) {
      if (settled) return;
      settled = true;
      // clearTimeout was added to Stash in 3.6; settled also guards old runtimes.
      if (typeof clearTimeout === "function") clearTimeout(timer);
      try {
        const latest = read(), all = latest.entries;
        const newer = !segments.length && all[key] && all[key].until > Date.now() && all[key].segments.length ? all[key] : null;
        if (newer) segments = newer.segments;
        all[key] = newer || { until: Date.now() + (failure ? 60000 : segments.length ? 21600000 : 600000), segments };
        const entries = Object.fromEntries(Object.entries(all).filter(([,v]) => v.until > Date.now()).sort((a,b) => b[1].until-a[1].until).slice(0,64));
        write({ entries, retryAfter: failure ? Date.now()+30000 : latest.retryAfter, pending: latest.pending && latest.pending.token === token ? undefined : latest.pending });
        done(segments);
      } catch (_) { done([]); }
    }
    timer = setTimeout(() => finish([], true), 1200);
    try {
      $httpClient.get({ url: `https://bsbsb.top/api/skipSegments?videoID=${video}&cid=${cid}&category=sponsor`, headers: { origin: "https://github.com/kokoryh/Sparkle/blob/master/release/surge/module/bilibili.sgmodule", "x-ext-version": "1.0.0" }, timeout: 1, "auto-cookie": false }, (error, response, body) => {
        if (settled) return;
        if (!error && response && Number(response.status) === 404) return finish([], false);
        if (error || !response || Number(response.status) !== 200 || !boundedBody(body)) return finish([], true);
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data)) throw new Error("array required");
          finish(pairs(data.filter(item => item && item.actionType === "skip").map(item => item.segment)), false);
        } catch (_) { finish([], true); }
      });
    } catch (_) { finish([], true); }
  } catch (_) { done([]); }
})();
