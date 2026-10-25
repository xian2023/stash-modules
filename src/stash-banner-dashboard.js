// The HTML placeholder is replaced with a JSON string at build time.
(() => {
  const base='https://api.bilibili.com/x/stash-banner/';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  if($request.url===base+'dashboard'&&$request.method==='GET') {
    $done({response:{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'},body:STASH_BANNER_DASHBOARD_HTML}});
    return;
  }
  if($request.url===base+'reset') {
    const key=Object.keys($request.headers||{}).find(name=>name.toLowerCase()==='x-stash-banner-action');
    if($request.method!=='POST'||!key||$request.headers[key]!=='reset') {
      $done({response:{status:405,headers:{...headers,'Content-Type':'application/json'},body:'{"cleared":false}'}});return;
    }
    let cleared=false;
    try{cleared=$persistentStore.write('{"version":1,"events":[]}','bili.stash.banner.ui.v1')!==false;}catch(_){}
    $done({response:{status:cleared?200:503,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({cleared})}});return;
  }
  if($request.url===base+'status'&&$request.method==='GET') {
    let raw,storageState='ready';
    const count=value=>Number.isInteger(value)&&value>=0&&value<=1000000;
    const summaryValid=(route,value)=>{
      if(!value||value.summary!=='decoded')return true;
      if(route==='view')return typeof value.cmConfig==='boolean'&&typeof value.cmIpad==='boolean'&&count(value.cms)&&count(value.specialCells)&&count(value.relates?.adIndicators);
      if(route==='relates'||route==='relates-unite')return count(value.relates?.adIndicators);
      return typeof value.cm==='boolean'&&count(value.sampledRelatedAds);
    };
    try {
      raw=$persistentStore.read('bili.stash.banner.ui.v1');
      if(raw===null||raw===undefined){storageState='empty';raw='{"version":1,"events":[]}';}
      if(typeof raw!=='string'||raw.length>32768)throw Error('storage invalid');
      const stored=JSON.parse(raw),routes=['view','viewunite','relates','relates-unite','async-relates'];
      if(stored?.version!==1||!Array.isArray(stored.events)||stored.events.length>5)throw Error('storage invalid');
      for(const event of stored.events) {
        if(!event||!routes.includes(event.route)||!['script-start','processed','fail-open'].includes(event.event)||!Number.isFinite(event.at))throw Error('storage invalid');
        for(const side of ['before','after'])if(!summaryValid(event.route,event[side]))event[side]={summary:'unavailable'};
      }
      raw=JSON.stringify(stored);
    }catch(_) {
      $done({response:{status:503,headers:{...headers,'Content-Type':'application/json'},body:'{"storageState":"unavailable"}'}});return;
    }
    // Reuse the redaction/expiry implementation with an already checked read;
    // a storage error must never be silently presented as an empty hit list.
    (function($persistentStore,$done){
      STASH_BANNER_STATUS_HANDLER
    })({read:()=>raw},result=>{
      result.response.headers={...result.response.headers,...headers};
      result.response.body=JSON.stringify({...JSON.parse(result.response.body),storageState});
      $done(result);
    });
    return;
  }
  $done({response:{status:404,headers:{...headers,'Content-Type':'application/json'},body:'{"error":"not-found"}'}});
})();
