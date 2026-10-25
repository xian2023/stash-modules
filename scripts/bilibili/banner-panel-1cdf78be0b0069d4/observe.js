// Shared by a small independent request script and the response entry marker.
// Fixed route labels and allowlisted REST path shapes only. No query/header/body values.
function stashBannerTransport(action) {
  var key='bili.stash.banner.transport.v1',now=Date.now();
  var routes={
    '/bilibili.app.show.v1.Popular/Index':'popular',
    '/bilibili.app.dynamic.v2.Dynamic/DynAll':'dynamic',
    '/bilibili.polymer.app.search.v1.Search/SearchAll':'search',
    '/bilibili.app.view.v1.View/View':'view',
    '/bilibili.app.viewunite.v1.View/View':'viewunite',
    '/bilibili.app.view.v1.View/RelatesFeed':'relates',
    '/bilibili.app.viewunite.v1.View/RelatesFeed':'relates-unite',
    '/bilibili.app.viewunite.v1.View/AIRelateAsync':'async-relates',
    '/bilibili.main.community.reply.v1.Reply/MainList':'comments',
    '/bilibili.app.view.v1.View/ViewProgress':'progress',
    '/bilibili.app.viewunite.v1.View/ViewProgress':'progress-unite',
    '/bilibili.app.playurl.v1.PlayURL/PlayView':'play',
    '/bilibili.app.playerunite.v1.Player/PlayViewUnite':'play-unite',
    '/bilibili.pgc.gateway.player.v2.PlayURL/PlayView':'play-pgc',
    '/bilibili.community.service.dm.v1.DM/DmView':'dm-view'
  };
  var vocabulary=('x pgc v1 v2 v3 v4 v5 v6 view app web-interface web interface resource show skin tab material materials ad ads advert advertise advertisement cm feed index index2 detail player playurl playview unite relate relates recommend related archive video ugc ogv reply main info config search default all hot ranking popular dynamic space account myinfo mine ipad stat report event list list2 splash pd-proxy tracker get post pull fetch ad_cb upper banner card cards large small online exposure click login logout auth refresh token activity deliver receive season page channel region extra command dm danmaku segment progress play behavior settings user nav notice msg message notify mobile android ios').split(' ');
  function safePath(path){return '/'+path.split('/').slice(1,13).map(function(segment){var word=segment.toLowerCase();return vocabulary.indexOf(word)>=0?word:'_';}).join('/');}
  function cleanPaths(items){
    if(items===undefined)return [];
    if(!Array.isArray(items)||items.length>48)throw Error('invalid paths');
    return items.map(function(item){
      if(!item||['app','api'].indexOf(item.host)<0||typeof item.path!=='string'||item.path.length>200||safePath(item.path)!==item.path)throw Error('invalid path');
      var clean={host:item.host,path:item.path};
      if(item.requestAt!==undefined){if(typeof item.requestAt!=='number'||!isFinite(item.requestAt))throw Error('invalid path time');if(validTime(item.requestAt))clean.requestAt=item.requestAt;}
      if(item.responseAt!==undefined){if(typeof item.responseAt!=='number'||!isFinite(item.responseAt))throw Error('invalid path time');if(validTime(item.responseAt))clean.responseAt=item.responseAt;}
      if(Number.isInteger(item.status)&&item.status>=100&&item.status<=599)clean.status=item.status;
      return clean;
    }).filter(function(item){return item.requestAt!==undefined||item.responseAt!==undefined;});
  }
  var allowed=Object.keys(routes).map(function(path){return routes[path];}).concat(['app-other-protobuf','app-json','api-json','app-other','api-other']);
  function validTime(at){return typeof at==='number'&&isFinite(at)&&now-at>=0&&now-at<=600000;}
  function entries(value){
    if(!Array.isArray(value)||value.length>24)throw Error('invalid entries');
    for(var i=0;i<value.length;i++)if(!value[i]||allowed.indexOf(value[i].route)<0||typeof value[i].at!=='number'||!isFinite(value[i].at))throw Error('invalid entry');
    return value.filter(function(item){return validTime(item.at);}).map(function(item){return {route:item.route,at:item.at};});
  }
  try {
    var raw=$persistentStore.read(key);
    if(raw===null||raw===undefined)return {storageState:'empty',armed:false,requests:[],responses:[],selfCheckAgeSeconds:null};
    if(typeof raw!=='string'||raw.length>32768)throw Error('invalid store');
    var value=JSON.parse(raw);
    if(!value||value.version!==1||typeof value.startedAt!=='number'||!isFinite(value.startedAt))throw Error('invalid store');
    var armed=validTime(value.startedAt),requests=entries(value.requests),responses=entries(value.responses);
    var paths=cleanPaths(value.paths),pathLimitReached=value.pathLimitReached===true;
    if(!armed){requests=[];responses=[];paths=[];}
    var selfCheckAt=armed&&validTime(value.selfCheckAt)?value.selfCheckAt:null;
    if(action==='read')return {storageState:'ready',armed:armed,windowSeconds:600,remainingSeconds:armed?Math.max(0,600-Math.floor((now-value.startedAt)/1000)):0,selfCheckAgeSeconds:selfCheckAt===null?null:Math.floor((now-selfCheckAt)/1000),requests:requests.map(report),responses:responses.map(report),paths:paths.map(function(item){var out={host:item.host,path:item.path};if(item.requestAt!==undefined)out.requestAgeSeconds=Math.floor((now-item.requestAt)/1000);if(item.responseAt!==undefined)out.responseHeaderAgeSeconds=Math.floor((now-item.responseAt)/1000);if(item.status!==undefined)out.status=item.status;return out;}),pathLimitReached:pathLimitReached};
    if(!armed)return {saved:false,reason:'not-armed'};
    if(action==='check')selfCheckAt=now;
    else if(action==='requests'||action==='responses'||action==='received'){
      // Parse without needing the URL API in this minimal entry script.
      var match=/^https:\/\/(app|api)\.bilibili\.com(\/[^?#]*)/.exec($request.url);
      if(!match||match[2].indexOf('/x/stash-')===0)return {saved:false,reason:'excluded'};
      var changed=false;
      if(action!=='received'){
        var route=match[1]==='app'&&Object.prototype.hasOwnProperty.call(routes,match[2])?routes[match[2]]:match[1]==='app'&&match[2].indexOf('/bilibili.')===0?'app-other-protobuf':/^\/(x|pgc)\//.test(match[2])?match[1]+'-json':match[1]+'-other';
        var list=action==='requests'?requests:responses;
        var previous=list.find(function(item){return item.route===route;});
        if(!previous||now-previous.at>=5000){list=list.filter(function(item){return item.route!==route;}).slice(-23);list.push({route:route,at:now});changed=true;}
        if(action==='requests')requests=list;else responses=list;
      }
      // Only REST/other paths; protobuf routes retain fixed labels above.
      if(action!=='responses'&&match[2].indexOf('/bilibili.')!==0){
        var shape=safePath(match[2]),entry=paths.find(function(item){return item.host===match[1]&&item.path===shape;}),side=action==='requests'?'requestAt':'responseAt';
        if(!entry||entry[side]===undefined||now-entry[side]>=5000){
          if(!entry){if(paths.length>=48){paths.shift();pathLimitReached=true;}entry={host:match[1],path:shape};paths.push(entry);}
          entry[side]=now;changed=true;
          if(action==='received'){var status=$response.status;if(Number.isInteger(status)&&status>=100&&status<=599)entry.status=status;}
        }
      }
      if(!changed)return {saved:true,throttled:true};
    }else return {saved:false,reason:'invalid-action'};
    var stored={version:1,startedAt:value.startedAt,selfCheckAt:selfCheckAt,requests:requests,responses:responses,paths:paths,pathLimitReached:pathLimitReached};
    var saved=$persistentStore.write(JSON.stringify(stored),key)===true;
    return {saved:saved};
  }catch(_){return {storageState:'unavailable',armed:false,saved:false,requests:[],responses:[],selfCheckAgeSeconds:null};}
  function report(item){return {route:item.route,ageSeconds:Math.floor((now-item.at)/1000)};}
}

stashBannerTransport('received');
$done({});
