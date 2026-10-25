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
