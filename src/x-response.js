// X/Twitter timeline ad filter, 2026-10-24. GPL-3.0-only.
// Independent Stash implementation. See docs/X_AD_FILTER.md for source references.
// No requests, cookies, logging, persistent storage or account changes.
(function () {
  "use strict";
  let output = {};
  try {
    const response = typeof $response === "object" && $response;
    const body = response && response.body;
    if (!response || (response.status && Number(response.status) !== 200) || typeof body !== "string" || body.length > 2097152) return $done({});
    // Avoid parsing and serializing the common no-ad response.
    if (!/promotedMetadata|promoted_metadata|promoted[-_](?:tweet|user|trend|account)/i.test(body)) return $done({});
    // JSON.parse/stringify must not round numeric 64-bit identifiers. Modern
    // GraphQL normally uses strings; older bodies with unsafe numbers pass through.
    const tokens = /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let token;
    while ((token = tokens.exec(body))) {
      if (token[0][0] === '"') continue;
      const value = Number(token[0]);
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) return $done({});
    }
    const root = JSON.parse(body);
    let changed = false;
    let visited = 0;
    const stack = [root];
    const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
    const marked = value => object(value) && !!(value.promotedMetadata || value.promoted_metadata);
    const id = value => object(value) ? String(value.entryId || value.entry_id || "") : "";
    const cursor = value => {
      const content = value && (value.content || value.item || value);
      return /^(?:cursor[-_]|sq-cursor)/i.test(id(value)) || !!(content && (content.cursorType || content.cursor_type || content.entryType === "TimelineTimelineCursor" || content.itemType === "TimelineTimelineCursor"));
    };
    function promoted(value) {
      if (!object(value) || cursor(value)) return false;
      if (/(?:^|[-_])promoted[-_](?:tweet|user|trend|account)(?:[-_]|$)/i.test(id(value))) return true;
      // Inspect display containers only, never arbitrary quoted/retweeted trees.
      const content = value.content;
      const item = value.item;
      const itemContent = value.itemContent;
      return marked(value) || marked(content) || marked(item) || marked(itemContent)
        || marked(content && content.itemContent) || marked(item && item.itemContent)
        || marked(content && content.item && content.item.content)
        || marked(content && content.item && content.item.content && content.item.content.tweet);
    }
    function keepEntry(entry) {
      if (promoted(entry)) { changed = true; return false; }
      if (!object(entry)) return true;
      for (const container of [entry.content, entry.item, entry]) {
        if (!object(container) || !Array.isArray(container.items)) continue;
        const before = container.items;
        const after = before.filter(child => !promoted(child));
        if (after.length !== before.length) {
          changed = true;
          container.items = after;
          if (before.length && !after.length && !cursor(entry)) return false;
        }
      }
      return true;
    }
    function filterEntries(holder, key, moduleItems) {
      if (!object(holder) || !Array.isArray(holder[key])) return;
      const before = holder[key];
      const after = before.filter(moduleItems ? child => !promoted(child) : keepEntry);
      if (after.length !== before.length) { holder[key] = after; changed = true; }
    }
    function keepInstruction(instruction) {
      if (!object(instruction)) return true;
      // Only timeline instructions are eligible, including the older REST shapes.
      const type = instruction.type || instruction.__typename;
      if (type && !["TimelineAddEntries", "TimelineAddToModule", "TimelineReplaceEntry", "TimelinePinEntry"].includes(type)) return true;
      if (!type && !instruction.addEntries && !instruction.addToModule && !instruction.replaceEntry && !instruction.pinEntry) return true;
      for (const holder of [instruction, instruction.addEntries]) filterEntries(holder, "entries", false);
      for (const holder of [instruction, instruction.addToModule]) filterEntries(holder, "moduleItems", true);
      for (const holder of [instruction, instruction.replaceEntry, instruction.pinEntry]) {
        if (object(holder) && object(holder.entry) && !keepEntry(holder.entry)) { changed = true; return false; }
      }
      return true;
    }
    while (stack.length) {
      const value = stack.pop();
      // Bound work on unfamiliar or exceptionally large payloads; original body
      // stays intact if this budget is exhausted, even after internal mutations.
      if (++visited > 50000) return $done({});
      if (!value || typeof value !== "object") continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object") stack.push(child);
        continue;
      }
      for (const key of Object.keys(value)) {
        if (key === "instructions" && Array.isArray(value[key])) {
          const before = value[key];
          const after = before.filter(keepInstruction);
          if (after.length !== before.length) { value[key] = after; changed = true; }
        }
        const child = value[key];
        if (child && typeof child === "object") stack.push(child);
      }
    }
    if (changed) output = { body: JSON.stringify(root) };
  } catch (_) {
    // Unknown schema, invalid JSON and errors preserve the original response.
  }
  $done(output);
})();
