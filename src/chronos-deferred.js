// Independent deferred controller; injected into kokoryh/chronos's main scope.
// GPL-3.0-only. Native contracts traced in docs/DEFERRED_AIRBORNE.md.
function installStashDeferredAirborne(context, bridge) {
  "use strict";
  const player = context.videoPlayer;
  const manager = context.workinfoManager;
  const slot = context.__stashDeferredAirborne || (context.__stashDeferredAirborne = {});
  if (typeof slot.dispose === "function") slot.dispose();
  const cache = new Map();
  let generation = 0;
  let active = null;
  let blocked = false;
  let disposed = false;
  let timer;
  let requestTimer;
  const validId = value => typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value);
  const running = () => !disposed && bridge.running();
  function identity() {
    const info = manager.workInfo;
    if (!info || !info.isReady || !validId(info.workId) || !validId(info.videoId)) return null;
    return { aid: info.workId, cid: info.videoId, key: info.workId + ":" + info.videoId };
  }
  function resetClock() {
    if (!active) return;
    active.stable = 0;
    active.lastWall = bridge.now();
    active.lastTime = Number(player.currentTime);
  }
  function cancelRequestTimer() {
    if (requestTimer !== undefined) bridge.cancel(requestTimer);
    requestTimer = undefined;
  }
  function invalidate() {
    ++generation;
    blocked = true;
    active = null;
    cancelRequestTimer();
  }
  function refresh() {
    if (disposed) return;
    const current = identity();
    if (!current) return;
    if (!active || active.key !== current.key || blocked) {
      ++generation;
      cancelRequestTimer();
      blocked = false;
      active = { ...current, stable: 0, requested: false, segments: [], skipped: new Set() };
      resetClock();
    }
  }
  function currentWork(token, key) {
    const current = identity();
    return !disposed && !blocked && active && generation === token && active.key === key
      && current && current.key === key;
  }
  function segmentsFrom(content) {
    if (typeof content !== "string" || content.length > 131072) return [];
    const value = JSON.parse(content);
    if (!Array.isArray(value) || value.length > 100) return [];
    const ranges = value.filter(pair => Array.isArray(pair) && pair.length === 2
      && pair.every(n => typeof n === "number" && Number.isFinite(n))
      && pair[0] >= 0 && pair[1] - pair[0] >= 8 && pair[1] * 1000 <= 2147483647)
      .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const pair of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && pair[0] <= previous[1]) previous[1] = Math.max(previous[1], pair[1]);
      else merged.push([pair[0], pair[1]]);
    }
    return merged;
  }
  function skipIfNeeded() {
    if (!active || blocked || !running() || !(player.playbackRate > 0)) return;
    const current = identity();
    if (!current || current.key !== active.key) return;
    const position = Number(player.currentTime);
    if (!Number.isFinite(position) || position < 0) return;
    const duration = Number(manager.workInfo.duration) / 1000;
    for (const pair of active.segments) {
      const key = pair[0] + ":" + pair[1];
      // Preserve the original two-second grace period. Never jump backwards or
      // beyond known video duration, and permit manual return after one skip.
      if (position < pair[0] + 2 || position >= pair[1] - 0.1 || active.skipped.has(key)) continue;
      if (Number.isFinite(duration) && duration > 0 && pair[1] > duration) continue;
      active.skipped.add(key);
      player.seekTo(pair[1]);
      return;
    }
  }
  function lookup() {
    if (!active || active.requested) return;
    active.requested = true;
    const key = active.key;
    const token = generation;
    const hit = cache.get(key);
    if (hit && hit.until > bridge.now()) {
      active.segments = hit.segments;
      skipIfNeeded();
      return;
    }
    const url = "https://api.bilibili.com/x/stash-airborne/segments?aid="
      + active.aid + "&cid=" + active.cid;
    let settled = false;
    requestTimer = bridge.schedule(() => { settled = true; requestTimer = undefined; }, 4, false);
    try {
      bridge.request(url, response => {
        if (settled) return;
        settled = true;
        // Do not cancel a new video's timer when an old callback arrives.
        if (!currentWork(token, key)) return;
        cancelRequestTimer();
        if (!response || response.expired || typeof response.content !== "string") return;
        let segments;
        try { segments = segmentsFrom(response.content); } catch (_) { return; }
        active.segments = segments;
        cache.set(key, { until: bridge.now() + (segments.length ? 21600000 : 600000), segments });
        while (cache.size > 32) cache.delete(cache.keys().next().value);
        skipIfNeeded();
      });
    } catch (_) { cancelRequestTimer(); }
  }
  function tick() {
    if (disposed || blocked) return;
    refresh();
    if (!active) return;
    if (!running() || !(player.playbackRate > 0)) { resetClock(); return; }
    const wall = bridge.now();
    const position = Number(player.currentTime);
    const elapsed = wall - active.lastWall;
    if (!Number.isFinite(position) || position < 0) { resetClock(); return; }
    if (elapsed >= 100) {
      const delta = position - active.lastTime;
      const rate = Number(player.playbackRate);
      if (elapsed > 3000 || delta <= 0 || delta > Math.max(5, elapsed / 1000 * rate + 2)) active.stable = 0;
      else active.stable += Math.min(elapsed, delta / rate * 1000);
      active.lastWall = wall;
      active.lastTime = position;
    }
    if (active.stable >= 8000) lookup();
    skipIfNeeded();
  }
  const workToken = manager.addListener({
    onWorkWillChange: invalidate,
    onCurrentWorkChanged: invalidate,
    onCurrentWorkInfoChanged: () => { blocked = false; refresh(); }
  });
  const playerToken = player.addListener({
    onTimeUpdated: tick,
    onSeeked: resetClock,
    onSeeking: resetClock,
    onPlaybackRateChanged: resetClock
  });
  slot.onRunning = () => {
    resetClock();
    if (!running()) {
      if (timer !== undefined) bridge.cancel(timer);
      timer = undefined;
    } else if (timer === undefined) timer = bridge.schedule(tick, 1, true);
  };
  if (!slot.listening) {
    context.addEventListener({ onRunningStateChanged: () => { if (slot.onRunning) slot.onRunning(); } });
    slot.listening = true;
  }
  refresh();
  if (running()) timer = bridge.schedule(tick, 1, true);
  slot.dispose = function dispose() {
    disposed = true;
    invalidate();
    if (timer !== undefined) bridge.cancel(timer);
    manager.removeListener(workToken);
    player.removeListener(playerToken);
    slot.onRunning = undefined;
    slot.dispose = undefined;
  };
  return slot.dispose;
}
