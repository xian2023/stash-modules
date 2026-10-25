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

// The HTML placeholder is replaced with a JSON string at build time.
(() => {
  const base='https://api.bilibili.com/x/stash-banner/';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://app.bilibili.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  if($request.url===base+'dashboard'&&$request.method==='GET') {
    $done({response:{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'},body:"<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>B站横幅诊断面板</title>\n<style>\n:root{color-scheme:light dark;font:16px/1.6 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f4f5f7;color:#20232a}*{box-sizing:border-box}body{margin:0;padding:28px 18px 52px}main{max-width:720px;margin:auto}h1{font-size:25px;line-height:1.35;margin:6px 0 12px}h2{font-size:18px;margin:0 0 8px}p{margin:8px 0}.tag{display:inline-block;background:#dff3e9;color:#175b3b;border-radius:20px;padding:4px 12px;font-size:13px}.muted{color:#626975;font-size:14px}.card{background:#fff;border:1px solid #e2e5eb;border-radius:16px;padding:18px;margin:16px 0}ol{padding-left:22px;margin:8px 0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:12px 16px;cursor:pointer;background:#ea4b83;color:#fff}button.secondary{background:#e9edf3;color:#28313c}button:disabled{opacity:.55;cursor:wait}#notice{white-space:pre-line}#results{display:grid;gap:12px}#paths p{overflow-wrap:anywhere;border-top:1px solid #7774;padding-top:8px;font-size:14px}.result{border-top:1px solid #e2e5eb;padding-top:12px}.result strong{display:block}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f4f5f7;padding:12px;border-radius:10px}details summary{cursor:pointer}a{color:#bb2c60}@media(prefers-color-scheme:dark){:root{background:#17191e;color:#eceef2}.card{background:#22252c;border-color:#373c47}.muted{color:#b0b7c4}.tag{background:#1d4735;color:#beefd5}button.secondary{background:#3c4350;color:#fff}.result{border-color:#424854}pre{background:#17191e}}\n</style>\n</head>\n<body><main>\n<span class=\"tag\">Stash 本机面板 · 页面已连接</span>\n<h1>B站横幅诊断</h1>\n<p class=\"muted\">版本 2026.10.25-banner-panel.3 · 不依赖 B站内提示或日志搜索</p>\n<section class=\"card\">\n<h2>开始一次可核对的测试</h2>\n<ol><li>点“开始本轮诊断”，只清空本机诊断摘要。</li><li>切到 B站，打开视频，看到横幅后尽快切回 Safari。</li><li>点“刷新结果”，截图结果即可。</li></ol>\n<p class=\"muted\">开始后观察 10 分钟，记录固定接口类别的请求/响应入口；详情字段摘要仍只保留 60 秒。不是完整抓包，也不对应某个视频。不需要保持视频前台播放或等待播放器提示。</p>\n<div class=\"actions\"><button id=\"start\">开始本轮诊断</button><button id=\"refresh\" class=\"secondary\">刷新结果</button><button id=\"copy\" class=\"secondary\">复制诊断摘要</button></div>\n<p id=\"notice\" role=\"status\">页面已经打开，正在检查本机状态接口…</p>\n</section>\n<section class=\"card\"><h2>接管与脚本入口</h2><div id=\"transport\"></div></section>\n<section class=\"card\"><h2>接口路径（脱敏形状）</h2><p class=\"muted\">仅保留固定接口词，未知路径段显示为 _；不同接口可能合并。最多保留 48 项，不是完整抓包。“响应头”不代表正文加载完成；已有原生过滤/静态响应的接口不额外观察响应。</p><div id=\"paths\"></div></section>\n<section class=\"card\"><h2>最近 60 秒详情字段摘要</h2><div id=\"results\"></div><details><summary>可截图的脱敏摘要</summary><pre id=\"raw\">尚未读取</pre></details></section>\n<section class=\"card\"><h2>如何解读</h2><p>“已处理”只代表脚本完成，不代表截图中的广告已经找到。“计数未知”可能是摘要超限或无法解析。</p><p>面板正常但没有记录时，可能是接口未命中、记录过期或过滤脚本未运行。不能直接认定广告来自 grpc。</p><p class=\"muted\">本页、状态、清空和 app 域名自检由 Stash 本机响应。临时请求探针直接放行原请求，只记录固定类别，不读取正文、请求头或查询参数。域名请求也可能来自其他应用，不能仅凭它认定是 B站 App。不要关闭 Stash 后访问；未启用对应模块时原站不提供此页面。</p></section>\n</main><script>\n'use strict';\nconst notice=document.getElementById('notice'),results=document.getElementById('results'),raw=document.getElementById('raw');\nconst start=document.getElementById('start'),refresh=document.getElementById('refresh'),transport=document.getElementById('transport'),pathResults=document.getElementById('paths'),copy=document.getElementById('copy');\nlet lastReport=null;\nconst names={view:'经典视频详情',viewunite:'统一视频详情',relates:'经典相关推荐','relates-unite':'统一相关推荐','async-relates':'异步相关推荐'};\nfunction controls(busy){start.disabled=busy;refresh.disabled=busy;copy.disabled=busy;}\nfunction emptyResults(message){results.replaceChildren();const line=document.createElement('p');line.textContent=message;results.append(line);}\nfunction number(value){return Number.isInteger(value)&&value>=0&&value<=1000000?value:null;}\nconst routeNames={...names,popular:'热门',dynamic:'动态',search:'搜索',comments:'一级评论',progress:'经典播放器资源', 'progress-unite':'统一播放器资源',play:'经典播放', 'play-unite':'统一播放','play-pgc':'番剧播放','dm-view':'弹幕配置','app-other-protobuf':'app 其他 protobuf 路径','app-json':'app JSON 类路径','api-json':'api JSON 类路径','app-other':'app 其他路径','api-other':'api 其他路径'};\nfunction transportLine(text){const line=document.createElement('p');line.textContent=text;transport.append(line);}\nfunction renderTransport(value){\n  transport.replaceChildren();pathResults.replaceChildren();\n  if(!value||!['ready','empty'].includes(value.storageState)){transportLine('请求/响应入口记录读取失败，不能判断为未命中。');return;}\n  if(!value.armed){transportLine('尚未开始或已超过 10 分钟，请点“开始本轮诊断”。');return;}\n  if(value.windowSeconds!==600||!Number.isInteger(value.remainingSeconds)||!Array.isArray(value.requests)||!Array.isArray(value.responses)||value.requests.length>24||value.responses.length>24)throw Error('invalid transport');\n  for(const side of ['requests','responses'])for(const item of value[side])if(!Object.hasOwn(routeNames,item?.route)||!Number.isInteger(item.ageSeconds)||item.ageSeconds<0||item.ageSeconds>600)throw Error('invalid transport entry');\n  transportLine('观察进行中，剩余约 '+value.remainingSeconds+' 秒。');\n  transportLine(value.selfCheckAgeSeconds===null?'app 域名自检尚未确认成功。':'app 域名请求自检已写入（'+value.selfCheckAgeSeconds+' 秒前）。这是 Safari 自检，不是 B站 App 的接口命中。');\n  transportLine('请求入口：'+(value.requests.length?value.requests.map(item=>routeNames[item.route]+'（'+item.ageSeconds+'秒前）').join('、'):'本轮尚无记录。'));\n  transportLine('过滤脚本入口：'+(value.responses.length?value.responses.map(item=>routeNames[item.route]+'（'+item.ageSeconds+'秒前）').join('、'):'本轮尚无记录。'));\n  if(!Array.isArray(value.paths)||value.paths.length>48)throw Error('invalid paths');\n  if(!value.paths.length){const line=document.createElement('p');line.textContent='本轮尚无可展示的路径。';pathResults.append(line);}\n  for(const item of [...value.paths].reverse()){\n    if(!['app','api'].includes(item?.host)||typeof item.path!=='string'||item.path.length>200||!/^\\/[a-z0-9_/-]+$/.test(item.path))throw Error('invalid path');\n    for(const key of ['requestAgeSeconds','responseHeaderAgeSeconds'])if(item[key]!==undefined&&(!Number.isInteger(item[key])||item[key]<0||item[key]>600))throw Error('invalid path time');\n    if(item.status!==undefined&&(!Number.isInteger(item.status)||item.status<100||item.status>599))throw Error('invalid status');\n    const line=document.createElement('p');line.textContent=item.host+': '+item.path+' — 请求 '+(item.requestAgeSeconds===undefined?'未记录':item.requestAgeSeconds+'秒前')+'；响应头 '+(item.responseHeaderAgeSeconds===undefined?'未记录':item.responseHeaderAgeSeconds+'秒前')+(item.status===undefined?'':'；HTTP '+item.status);pathResults.append(line);\n  }\n  if(value.pathLimitReached===true){const line=document.createElement('p');line.textContent='路径记录达到上限，部分旧项已被替换。';pathResults.append(line);}\n  transportLine('自检成功且有请求、但没有过滤入口时，继续检查接口类别和响应脚本；三者均无业务记录时，也不能据此确定 grpc 来源。记录按类别限频，不是请求次数。');\n}\nfunction render(report){\n  if(report?.version!==1||report.windowSeconds!==60||!Array.isArray(report.events)||report.events.length>5)throw Error('invalid status');\n  for(const event of report.events){if(!Object.hasOwn(names,event?.route)||!['processed','fail-open','script-start'].includes(event.event))throw Error('invalid event');}\n  renderTransport(report.transport);results.replaceChildren();raw.textContent=JSON.stringify(report,null,2);lastReport=report;\n  if(!report.events.length){emptyResults('最近60秒没有有效的详情/关联记录。请先开始本轮诊断，复现广告后尽快刷新；没有记录不能确定接口域名。');return;}\n  for(const event of report.events){\n    const item=document.createElement('div');item.className='result';const title=document.createElement('strong');title.textContent=names[event.route];item.append(title);\n    const text=document.createElement('p');\n    if(event.event==='fail-open')text.textContent='处理失败，已按原逻辑放行原响应。';\n    else if(event.event==='script-start')text.textContent='已记录脚本开始，还没有完成结果。';\n    else if(event.before?.available!==true||event.after?.available!==true)text.textContent='处理链已完成，但摘要不可用，计数未知。';\n    else {\n      const values=[event.before.bannerFields,event.after.bannerFields,event.before.relatedIndicators,event.after.relatedIndicators].map(number);\n      text.textContent=values.some(value=>value===null)?'处理链已完成，计数格式不可用。':'处理链已完成。推广字段 '+values[0]+' → '+values[1]+'；采样关联标记 '+values[2]+' → '+values[3]+'。';\n    }\n    item.append(text);results.append(item);\n  }\n}\nasync function readStatus(){const response=await fetch('/x/stash-banner/status',{cache:'no-store',credentials:'omit'});const data=await response.json();if(!response.ok){const error=Error('status unavailable');error.storageFailure=data?.storageState==='unavailable';throw error;}return data;}\nasync function update(){controls(true);try{render(await readStatus());notice.textContent='状态接口已连接。读取时间：'+new Date().toLocaleTimeString()+'。';}catch(error){notice.textContent=error?.storageFailure?'本机摘要存储不可用。可以点“开始本轮诊断”重建；不能判断为未命中。':'页面已打开，但状态读取失败。请确认只启用了本面板模块、Stash 仍在连接，然后重试。';lastReport=null;pathResults.replaceChildren();transport.replaceChildren();transportLine('状态读取失败，入口记录未知。');emptyResults('没有有效结果，不能判断为未命中。');raw.textContent='状态读取失败';}finally{controls(false);}}\nstart.addEventListener('click',async()=>{\n  controls(true);lastReport=null;\n  try{\n    const response=await fetch('/x/stash-banner/reset',{method:'POST',headers:{'X-Stash-Banner-Action':'reset'},cache:'no-store',credentials:'omit'});\n    const data=await response.json();if(!response.ok||data?.cleared!==true)throw Error('reset failed');\n    let checked=false;\n    try{const check=await fetch('https://app.bilibili.com/x/stash-banner/check',{cache:'no-store',credentials:'omit'});const value=await check.json();checked=check.ok&&value?.probe==='app-request'&&value.saved===true;}catch(_){}\n    render(await readStatus());\n    notice.textContent=checked?'本轮已开始，app 域名自检通过。现在切到 B站打开视频，复现后回来刷新；观察窗口 10 分钟。':'本轮已开始，但 app 域名自检未通过。请先截图本页，不能把空记录判断为接口未命中。';\n  }catch(_){notice.textContent='开始失败，本轮尚未确认清空。检查 Stash 连接后再试。';}finally{controls(false);}\n});\ncopy.addEventListener('click',async()=>{if(!lastReport){notice.textContent='尚无有效摘要，请先刷新结果。';return;}try{await navigator.clipboard.writeText(JSON.stringify(lastReport,null,2));notice.textContent='诊断摘要已复制，可以直接粘贴到聊天。';}catch(_){notice.textContent='未能自动复制，可以长按下方脱敏摘要复制。';}});\nrefresh.addEventListener('click',update);\nupdate();\n</script></body></html>\n"}});
    return;
  }
  if($request.url===base+'reset') {
    const key=Object.keys($request.headers||{}).find(name=>name.toLowerCase()==='x-stash-banner-action');
    if($request.method!=='POST'||!key||$request.headers[key]!=='reset') {
      $done({response:{status:405,headers:{...headers,'Content-Type':'application/json'},body:'{"cleared":false}'}});return;
    }
    let cleared=false;
    try{const first=$persistentStore.write('{"version":1,"events":[]}','bili.stash.banner.ui.v1')===true;const second=$persistentStore.write(JSON.stringify({version:1,startedAt:Date.now(),selfCheckAt:null,requests:[],responses:[]}),'bili.stash.banner.transport.v1')===true;cleared=first&&second;}catch(_){}
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

    })({read:()=>raw},result=>{
      result.response.headers={...result.response.headers,...headers};
      result.response.body=JSON.stringify({...JSON.parse(result.response.body),storageState,transport:stashBannerTransport('read')});
      $done(result);
    });
    return;
  }
  $done({response:{status:404,headers:{...headers,'Content-Type':'application/json'},body:'{"error":"not-found"}'}});
})();
