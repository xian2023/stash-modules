// Temporary local-only metadata probe. Never log URLs, headers, message text,
// field values, video IDs or unknown-field bytes. Existing filtering is kept.
const stashBannerProbeCodecs = {
  '/bilibili.app.view.v1.View/View': ['view', ft],
  '/bilibili.app.viewunite.v1.View/View': ['viewunite', Lt],
  '/bilibili.app.view.v1.View/RelatesFeed': ['relates', dt],
  '/bilibili.app.viewunite.v1.View/RelatesFeed': ['relates-unite', $t],
  '/bilibili.app.viewunite.v1.View/AIRelateAsync': ['async-relates', jt]
};
function stashBannerProbeLog(value) {
  try { console.log('[BiliBanner] ' + JSON.stringify(value)); } catch (_) {}
  // Bounded local metadata for the player's status endpoint. Keep only the
  // latest event for each of five routes; never persist payloads or IDs.
  try {
    if(!['script-start','processed','fail-open'].includes(value.event))return;
    const key='bili.stash.banner.ui.v1',now=Date.now(),raw=$persistentStore.read(key);
    let stored=null;
    try{if(typeof raw==='string'&&raw.length<=32768)stored=JSON.parse(raw);}catch(_){}
    const events=stored?.version===1&&Array.isArray(stored.events)?stored.events:[];
    const recent=events.filter(event=>event&&event.route!==value.route&&Number.isFinite(event.at)&&now-event.at>=0&&now-event.at<=60000).slice(-4);
    recent.push({at:now,...value});
    const text=JSON.stringify({version:1,events:recent});
    if(text.length<=32768)$persistentStore.write(text,key);
  }catch(_){}
}
function stashBannerProbeSummary(kind, type, body) {
  // Additional decoding is diagnostic-only and bounded independently of the
  // normal 4 MiB filter. Oversized bodies are filtered normally, not sampled.
  if (!(body instanceof Uint8Array)) return { summary: 'unavailable' };
  if (body.length > 262144) return { summary: 'over-256KiB', bytes: body.length };
  try {
    const message = type.fromBinary(body);
    const unknown = u.list(message);
    const result = {
      summary: 'decoded', bytes: body.length,
      unknownFieldCount: unknown.length,
      unknownFields: unknown.slice(0, 24).map(field => ({ no: field.no, wireType: field.wireType }))
    };
    const bytesPresent = value => value instanceof Uint8Array && value.length > 0;
    const cards = values => {
      const list = Array.isArray(values) ? values : [];
      const sample = list.slice(0, 128);
      return {
        count: list.length, sampled: sample.length,
        cm: sample.filter(card => bytesPresent(card.cm)).length,
        cmStock: sample.filter(card => bytesPresent(card.cmStock)).length,
        promotionId: sample.filter(card => !!card.basicInfo?.uniqueId).length,
        adType: sample.filter(card => [4, 5, 6, 7, 11].includes(card.relateCardType)).length,
        adIndicators: sample.filter(card => bytesPresent(card.cm) || bytesPresent(card.cmStock) || !!card.basicInfo?.uniqueId || [4, 5, 6, 7, 11].includes(card.relateCardType)).length
      };
    };
    if (kind === 'view') {
      Object.assign(result, {
        cmConfig: bytesPresent(message.cmConfig), cmIpad: bytesPresent(message.cmIpad),
        cms: message.cms.length, specialCells: message.specialCellNew.length,
        relates: cards(message.relates)
      });
    } else if (kind === 'relates') result.relates = cards(message.list);
    else if (kind === 'relates-unite') result.relates = cards(message.relates);
    else {
      result.cm = bytesPresent(message.cm);
      const modules = [];
      if (kind === 'viewunite') {
        for (const tab of (message.tab?.tabModule || []).slice(0, 32)) {
          if (tab.tab?.oneofKind === 'introduction') modules.push(...tab.tab.introduction.modules.slice(0, 128));
        }
      } else modules.push(...(message.module?.modules || []).slice(0, 128));
      result.moduleTypes = {};
      let relatedCount = 0, relatedAds = 0;
      for (const item of modules.slice(0, 128)) {
        if (Number.isInteger(item.type)) result.moduleTypes[item.type] = (result.moduleTypes[item.type] || 0) + 1;
        if (item.data?.oneofKind === 'relates') {
          const summary = cards(item.data.relates.cards);
          relatedCount += summary.count;
          relatedAds += summary.adIndicators;
        }
      }
      result.sampledModules = Math.min(modules.length, 128);
      result.relatedCount = relatedCount;
      result.sampledRelatedAds = relatedAds;
    }
    return result;
  } catch (_) { return { summary: 'decode-failed' }; }
}
const stashBannerProbeFraming = kn;
// This entry marker also survives an early middleware rejection before kn.
try {
  const url = new URL($request.url);
  const target = url.hostname === 'app.bilibili.com' && stashBannerProbeCodecs[url.pathname];
  if (target) stashBannerProbeLog({ route: target[0], event: 'script-start', host: 'app.bilibili.com' });
} catch (_) {}
kn = async function (context, next) {
  let target;
  try {
    const url = new URL(context.request.url);
    if (url.hostname === 'app.bilibili.com') target = stashBannerProbeCodecs[url.pathname];
  } catch (_) {}
  if (!target) return stashBannerProbeFraming(context, next);
  const [route, type] = target;
  const started = Date.now();
  let stage = 'framing', before, after;
  stashBannerProbeLog({ route, event: 'hit', host: 'app.bilibili.com' });
  try {
    await stashBannerProbeFraming(context, async () => {
      stage = 'handler';
      before = stashBannerProbeSummary(route, type, context.response.bodyBytes);
      await next();
      after = stashBannerProbeSummary(route, type, context.response.bodyBytes);
      stage = 'reframing';
    });
    stashBannerProbeLog({ route, event: 'processed', before, after, scriptMs: Math.max(0, Date.now() - started) });
  } catch (error) {
    // Retain the original error/fail-open path. Do not stringify the error,
    // since it could contain input supplied by a future upstream decoder.
    stashBannerProbeLog({ route, event: 'fail-open', stage });
    throw error;
  }
};
mn = new H;
mn.use(wn).use(Rn).use(kn).use(R.routes()).use(R.routeNotMatched());
