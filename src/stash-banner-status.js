// Local synthetic report: do not forward this request or return field values.
(() => {
  const empty={version:1,windowSeconds:60,events:[]};
  const count=value=>Number.isInteger(value)&&value>=0&&value<=1000000?value:0;
  const routes=['view','viewunite','relates','relates-unite','async-relates'];
  function summary(value) {
    if(!value||typeof value!=='object'||value.summary!=='decoded')return {available:false};
    return {
      available:true,
      bannerFields:(value.cm===true?1:0)+(value.cmConfig===true?1:0)+(value.cmIpad===true?1:0)+count(value.cms)+count(value.specialCells),
      relatedIndicators:count(value.relates?.adIndicators)+count(value.sampledRelatedAds)
    };
  }
  let result=empty;
  try {
    if($request.method==='GET'&&$request.url==='https://api.bilibili.com/x/stash-banner/status') {
      const raw=$persistentStore.read('bili.stash.banner.ui.v1');
      if(typeof raw==='string'&&raw.length<=32768) {
        const stored=JSON.parse(raw),now=Date.now(),events=[];
        if(stored?.version===1&&Array.isArray(stored.events))for(const event of stored.events.slice(-5)) {
          if(!routes.includes(event?.route)||!['script-start','processed','fail-open'].includes(event.event))continue;
          if(!Number.isFinite(event.at)||now-event.at<0||now-event.at>60000)continue;
          events.push({route:event.route,event:event.event,before:summary(event.before),after:summary(event.after)});
        }
        result={...empty,events};
      }
    }
  }catch(_){}
  $done({response:{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(result)}});
})();
