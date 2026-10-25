// Shared by a small independent request script and the response entry marker.
// Fixed route labels only; never store paths, query strings, headers or bodies.
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
    if(typeof raw!=='string'||raw.length>8192)throw Error('invalid store');
    var value=JSON.parse(raw);
    if(!value||value.version!==1||typeof value.startedAt!=='number'||!isFinite(value.startedAt))throw Error('invalid store');
    var armed=validTime(value.startedAt),requests=entries(value.requests),responses=entries(value.responses);
    if(!armed){requests=[];responses=[];}
    var selfCheckAt=armed&&validTime(value.selfCheckAt)?value.selfCheckAt:null;
    if(action==='read')return {storageState:'ready',armed:armed,windowSeconds:600,remainingSeconds:armed?Math.max(0,600-Math.floor((now-value.startedAt)/1000)):0,selfCheckAgeSeconds:selfCheckAt===null?null:Math.floor((now-selfCheckAt)/1000),requests:requests.map(report),responses:responses.map(report)};
    if(!armed)return {saved:false,reason:'not-armed'};
    if(action==='check')selfCheckAt=now;
    else if(action==='requests'||action==='responses'){
      // Parse without needing the URL API in this minimal entry script.
      var match=/^https:\/\/(app|api)\.bilibili\.com(\/[^?#]*)/.exec($request.url);
      if(!match||match[2].indexOf('/x/stash-')===0)return {saved:false,reason:'excluded'};
      var route=match[1]==='app'&&Object.prototype.hasOwnProperty.call(routes,match[2])?routes[match[2]]:match[1]==='app'&&match[2].indexOf('/bilibili.')===0?'app-other-protobuf':/^\/(x|pgc)\//.test(match[2])?match[1]+'-json':match[1]+'-other';
      var list=action==='requests'?requests:responses;
      var previous=list.find(function(item){return item.route===route;});
      // A presence indicator, not a request counter; bound writes per category.
      if(previous&&now-previous.at<5000)return {saved:true,throttled:true};
      list=list.filter(function(item){return item.route!==route;}).slice(-23);list.push({route:route,at:now});
      if(action==='requests')requests=list;else responses=list;
    }else return {saved:false,reason:'invalid-action'};
    var stored={version:1,startedAt:value.startedAt,selfCheckAt:selfCheckAt,requests:requests,responses:responses};
    var saved=$persistentStore.write(JSON.stringify(stored),key)===true;
    return {saved:saved};
  }catch(_){return {storageState:'unavailable',armed:false,saved:false,requests:[],responses:[],selfCheckAgeSeconds:null};}
  function report(item){return {route:item.route,ageSeconds:Math.floor((now-item.at)/1000)};}
}
