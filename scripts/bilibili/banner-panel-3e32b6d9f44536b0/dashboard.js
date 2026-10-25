// The HTML placeholder is replaced with a JSON string at build time.
(() => {
  const base='https://api.bilibili.com/x/stash-banner/';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
  if($request.url===base+'dashboard'&&$request.method==='GET') {
    $done({response:{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'},body:"<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>B站横幅诊断面板</title>\n<style>\n:root{color-scheme:light dark;font:16px/1.6 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f4f5f7;color:#20232a}*{box-sizing:border-box}body{margin:0;padding:28px 18px 52px}main{max-width:720px;margin:auto}h1{font-size:25px;line-height:1.35;margin:6px 0 12px}h2{font-size:18px;margin:0 0 8px}p{margin:8px 0}.tag{display:inline-block;background:#dff3e9;color:#175b3b;border-radius:20px;padding:4px 12px;font-size:13px}.muted{color:#626975;font-size:14px}.card{background:#fff;border:1px solid #e2e5eb;border-radius:16px;padding:18px;margin:16px 0}ol{padding-left:22px;margin:8px 0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}button{font:inherit;font-weight:600;border:0;border-radius:12px;padding:12px 16px;cursor:pointer;background:#ea4b83;color:#fff}button.secondary{background:#e9edf3;color:#28313c}button:disabled{opacity:.55;cursor:wait}#notice{white-space:pre-line}#results{display:grid;gap:12px}.result{border-top:1px solid #e2e5eb;padding-top:12px}.result strong{display:block}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#f4f5f7;padding:12px;border-radius:10px}details summary{cursor:pointer}a{color:#bb2c60}@media(prefers-color-scheme:dark){:root{background:#17191e;color:#eceef2}.card{background:#22252c;border-color:#373c47}.muted{color:#b0b7c4}.tag{background:#1d4735;color:#beefd5}button.secondary{background:#3c4350;color:#fff}.result{border-color:#424854}pre{background:#17191e}}\n</style>\n</head>\n<body><main>\n<span class=\"tag\">Stash 本机面板 · 页面已连接</span>\n<h1>B站横幅诊断</h1>\n<p class=\"muted\">版本 2026.10.25-banner-panel.1 · 不依赖 B站内提示或日志搜索</p>\n<section class=\"card\">\n<h2>开始一次可核对的测试</h2>\n<ol><li>点“开始本轮诊断”，只清空本机诊断摘要。</li><li>切到 B站，打开视频，看到横幅后尽快切回 Safari。</li><li>点“刷新结果”，截图结果即可。</li></ol>\n<p class=\"muted\">只读取最近 60 秒各类接口的最新记录，不是完整时间线，也不对应某个视频。超过窗口请重新开始。不需要保持视频前台播放，也不需要播放器资源成功加载。</p>\n<div class=\"actions\"><button id=\"start\">开始本轮诊断</button><button id=\"refresh\" class=\"secondary\">刷新结果</button></div>\n<p id=\"notice\" role=\"status\">页面已经打开，正在检查本机状态接口…</p>\n</section>\n<section class=\"card\"><h2>接口处理结果</h2><div id=\"results\"></div><details><summary>可截图的脱敏摘要</summary><pre id=\"raw\">尚未读取</pre></details></section>\n<section class=\"card\"><h2>如何解读</h2><p>“已处理”只代表脚本完成，不代表截图中的广告已经找到。“计数未知”可能是摘要超限或无法解析。</p><p>面板正常但没有记录时，可能是接口未命中、记录过期或过滤脚本未运行。不能直接认定广告来自 grpc。</p><p class=\"muted\">本页、状态和清空操作均由 Stash 本机直接响应，没有第三方资源或数据上传。不要关闭 Stash 后访问；未启用对应模块时原站不提供此页面。</p></section>\n</main><script>\n'use strict';\nconst notice=document.getElementById('notice'),results=document.getElementById('results'),raw=document.getElementById('raw');\nconst start=document.getElementById('start'),refresh=document.getElementById('refresh');\nconst names={view:'经典视频详情',viewunite:'统一视频详情',relates:'经典相关推荐','relates-unite':'统一相关推荐','async-relates':'异步相关推荐'};\nfunction controls(busy){start.disabled=busy;refresh.disabled=busy;}\nfunction emptyResults(message){results.replaceChildren();const line=document.createElement('p');line.textContent=message;results.append(line);}\nfunction number(value){return Number.isInteger(value)&&value>=0&&value<=1000000?value:null;}\nfunction render(report){\n  if(report?.version!==1||report.windowSeconds!==60||!Array.isArray(report.events)||report.events.length>5)throw Error('invalid status');\n  for(const event of report.events){if(!Object.hasOwn(names,event?.route)||!['processed','fail-open','script-start'].includes(event.event))throw Error('invalid event');}\n  results.replaceChildren();raw.textContent=JSON.stringify(report,null,2);\n  if(!report.events.length){emptyResults('最近60秒没有有效的详情/关联记录。请先开始本轮诊断，复现广告后尽快刷新；没有记录不能确定接口域名。');return;}\n  for(const event of report.events){\n    const item=document.createElement('div');item.className='result';const title=document.createElement('strong');title.textContent=names[event.route];item.append(title);\n    const text=document.createElement('p');\n    if(event.event==='fail-open')text.textContent='处理失败，已按原逻辑放行原响应。';\n    else if(event.event==='script-start')text.textContent='已记录脚本开始，还没有完成结果。';\n    else if(event.before?.available!==true||event.after?.available!==true)text.textContent='处理链已完成，但摘要不可用，计数未知。';\n    else {\n      const values=[event.before.bannerFields,event.after.bannerFields,event.before.relatedIndicators,event.after.relatedIndicators].map(number);\n      text.textContent=values.some(value=>value===null)?'处理链已完成，计数格式不可用。':'处理链已完成。推广字段 '+values[0]+' → '+values[1]+'；采样关联标记 '+values[2]+' → '+values[3]+'。';\n    }\n    item.append(text);results.append(item);\n  }\n}\nasync function readStatus(){const response=await fetch('/x/stash-banner/status',{cache:'no-store',credentials:'omit'});const data=await response.json();if(!response.ok){const error=Error('status unavailable');error.storageFailure=data?.storageState==='unavailable';throw error;}return data;}\nasync function update(){controls(true);try{render(await readStatus());notice.textContent='状态接口已连接。读取时间：'+new Date().toLocaleTimeString()+'。';}catch(error){notice.textContent=error?.storageFailure?'本机摘要存储不可用。可以点“开始本轮诊断”重建；不能判断为未命中。':'页面已打开，但状态读取失败。请确认只启用了本面板模块、Stash 仍在连接，然后重试。';emptyResults('没有有效结果，不能判断为未命中。');raw.textContent='状态读取失败';}finally{controls(false);}}\nstart.addEventListener('click',async()=>{controls(true);try{const response=await fetch('/x/stash-banner/reset',{method:'POST',headers:{'X-Stash-Banner-Action':'reset'},cache:'no-store',credentials:'omit'});const data=await response.json();if(!response.ok||data?.cleared!==true)throw Error('reset failed');render(await readStatus());notice.textContent='本轮已开始。现在切到 B站，看到横幅后尽快回来点“刷新结果”。';}catch(_){notice.textContent='开始失败，本轮尚未确认清空。检查 Stash 连接后再试。';}finally{controls(false);}});\nrefresh.addEventListener('click',update);\nupdate();\n</script></body></html>\n"}});
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
      result.response.body=JSON.stringify({...JSON.parse(result.response.body),storageState});
      $done(result);
    });
    return;
  }
  $done({response:{status:404,headers:{...headers,'Content-Type':'application/json'},body:'{"error":"not-found"}'}});
})();
