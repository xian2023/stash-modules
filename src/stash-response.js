G.prototype.createRequest = stashObject;
G.prototype.createResponse = stashObject;
G.prototype.done = stashDone;
D.prototype.onerror = function(error) {
  this.state.type = error instanceof K ? "abort" : "exit";
  if (!(error instanceof q) || error.code !== 0) T.error(String(error));
};
be = stashGunzip;
kn = stashFraming;

// The upstream router captured kn only at middleware registration time.
mn = new H;
mn.use(wn).use(Rn).use(kn).use(R.routes()).use(R.routeNotMatched());
