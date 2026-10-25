G.prototype.createRequest = stashObject;
G.prototype.createResponse = stashObject;
G.prototype.done = stashDone;
D.prototype.onerror = function(error) {
  this.state.type = error instanceof K ? "abort" : "exit";
  if (!(error instanceof q) || error.code !== 0) T.error(String(error));
};
be = stashGunzip;
kn = stashFraming;
Rn = stashGrpcStatus;

// Only replace the traced universal package used by standard Bilibili iPhone.
// Unknown/HD/international packages keep upstream behavior; no DM enrichment
// is registered, so deferred automatic skipping is supported on standard only.
const stashOriginalChronos = ii;
ii = function (resource, headers) {
  stashOriginalChronos(resource, headers);
  if (resource.md5 === "e5a968f1a5055bbe5c12e67b100a6dcb") {
    resource.md5 = STASH_DEFERRED_CHRONOS.md5;
    resource.file = STASH_DEFERRED_CHRONOS.url;
  }
};

// The upstream router captured kn only at middleware registration time.
mn = new H;
mn.use(wn).use(Rn).use(kn).use(R.routes()).use(R.routeNotMatched());
