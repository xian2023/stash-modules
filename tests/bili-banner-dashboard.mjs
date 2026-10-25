import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import YAML from 'yaml';

const read=path=>fs.readFileSync(path,'utf8'),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const m=JSON.parse(read('modules/Bilibili_banner_dashboard.manifest.json'));
const text=read(m.module),config=YAML.parse(text),full=YAML.parse(read(m.baseline.module));
assert.equal(sha(text),m.sha256);assert.equal(m.version,config.version);assert.equal(m.exclusive,true);
assert.equal(sha(read(m.baseline.module)),'bdfc9e53c726817ec0d29450b678524ef4e0a0174466a570e4aecb3e0c150939');
const workerHook=config.http.script.find(h=>h.name.startsWith('bili-banner-dashboard-'));
const probeHook=config.http.script.find(h=>h.name.startsWith('bili-banner-panel-probe-'));
const requestHook=config.http.script.find(h=>h.name.startsWith('bili-banner-request-'));
const observerHook=config.http.script.find(h=>h.name.startsWith('bili-banner-observe-'));
const oldHook=full.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
const normalized=structuredClone(config);
for(const key of ['name','desc','version'])normalized[key]=full[key];
normalized.http.script=normalized.http.script.filter(h=>h.name!==workerHook.name&&h.name!==requestHook.name&&h.name!==observerHook.name);
normalized.http.script.find(h=>h.name===probeHook.name).name=oldHook.name;
delete normalized['script-providers'][observerHook.name];delete normalized['script-providers'][requestHook.name];delete normalized['script-providers'][probeHook.name];delete normalized['script-providers'][workerHook.name];
normalized['script-providers'][oldHook.name]=full['script-providers'][oldHook.name];
assert.deepEqual(normalized,full,'only diagnostic endpoints, request presence and response telemetry are added');
assert.equal(workerHook['require-body'],false);
for(const path of ['dashboard','status','reset'])assert(new RegExp(workerHook.match).test('https://api.bilibili.com/x/stash-banner/'+path));
for(const url of ['https://grpc.biliapi.net/x/stash-banner/status','https://api.bilibili.com.evil.example/x/stash-banner/status','https://api.bilibili.com/x/stash-banner/status-other','https://api.bilibili.com/x/stash-banner/status?token=1'])assert(!new RegExp(workerHook.match).test(url));
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
const source=read(m.dashboardScript.url.slice(rawBase.length)),responseSource=read(m.responseScript.url.slice(rawBase.length));
assert.equal(sha(source),m.dashboardScript.sha256);assert.equal(sha(responseSource),m.responseScript.sha256);
const requestSource=read(m.requestScript.url.slice(rawBase.length));assert.equal(sha(requestSource),m.requestScript.sha256);
assert.equal(requestHook['require-body'],false);
for(const url of ['https://app.bilibili.com/bilibili.app.viewunite.v1.View/View','https://api.bilibili.com/x/test?secret=1','https://app.bilibili.com/x/stash-banner/check'])assert(new RegExp(requestHook.match).test(url));
for(const url of ['https://grpc.biliapi.net/anything','https://app.bilibili.com.evil.example/test','https://api.bilibili.com/x/stash-banner/status','https://api.bilibili.com/x/stash-airborne/segments?aid=1','https://app.bilibili.com/x/stash-banner/check?extra=1'])assert(!new RegExp(requestHook.match).test(url));
const observerSource=read(m.observerScript.url.slice(rawBase.length));assert.equal(sha(observerSource),m.observerScript.sha256);
assert.equal(observerHook['require-body'],false);assert.equal(observerHook['max-size'],4194304);assert.equal(requestHook['max-size'],4194304);
const observerRE=new RegExp(observerHook.match.replace(/^\(\?i\)/,''),'i');
for(const url of ['https://app.bilibili.com/x/v2/view/material?aid=1','https://api.bilibili.com/x/v2/view/ad?aid=1','https://api.bilibili.com/other/path'])assert(observerRE.test(url));
for(const url of ['https://app.bilibili.com/x/v2/feed/index?x=1','https://app.bilibili.com/x/v2/feed/index/story?x=1','https://app.bilibili.com/x/resource/show/tab/v2?x=1','https://app.bilibili.com/x/v2/account/mine?x=1','https://api.bilibili.com/pgc/view/v2/app/season?x=1','https://api.bilibili.com/x/pd-proxy/tracker?x=1','https://app.bilibili.com/x/v2/splash/list?x=1','https://app.bilibili.com/x/v2/search/square?x=1','https://api.bilibili.com/x/stash-banner/status','https://api.bilibili.com/x/stash-airborne/segments?x=1','https://grpc.biliapi.net/anything','https://app.bilibili.com.evil.example/x/test','https://app.bilibili.com/bilibili.app.view.v1.View/View'])assert(!observerRE.test(url),url);
const chronos=JSON.parse(read('modules/chronos.manifest.json'));
assert(responseSource.includes('const STASH_DEFERRED_CHRONOS = '+JSON.stringify({md5:chronos.md5,url:chronos.url})+';'));
assert(!responseSource.includes('installStashBannerDiagnostic'));
const secret='SENSITIVE_INPUT_MUST_NOT_APPEAR',now=Date.now(),key='bili.stash.banner.ui.v1';
const store=new Map([[key,JSON.stringify({version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'decoded',cm:true,sampledRelatedAds:2},after:{summary:'decoded',cm:false,sampledRelatedAds:0},private:secret}]})],['unrelated.setting','keep']]);
function execute(path,{method='GET',headers={},failWrite=false,failRead=false,date=Date}={}) {
  let output,count=0,reads=0;const writes=[];
  const context={Date:date,$request:{url:'https://api.bilibili.com/x/stash-banner/'+path,method,headers},$persistentStore:{read:k=>{reads++;if(failRead)throw Error('read unavailable');return store.get(k)??null;},write:(value,k)=>{writes.push(k);if(failWrite)return false;store.set(k,value);return true;}},$done:value=>{count++;output=value;}};
  vm.runInNewContext(source,context);assert.equal(count,1);assert(!output.response.body.includes(secret));return {response:structuredClone(output.response),reads,writes};
}
const page=execute('dashboard');assert.equal(page.response.status,200);assert.equal(page.reads,0);assert.equal(page.writes.length,0);assert.equal(page.response.body,read('src/banner-dashboard.html'));
assert(page.response.headers['Content-Security-Policy'].includes("default-src 'none'"));assert(page.response.headers['Content-Security-Policy'].includes("connect-src 'self' https://app.bilibili.com;"));
assert.equal(execute('status').response.status,200);const report=JSON.parse(execute('status').response.body);assert.equal(report.events[0].before.bannerFields,1);
assert.equal(execute('status',{failRead:true}).response.status,503);
const originalStore=store.get(key);store.set(key,'{broken');assert.equal(execute('status').response.status,503);
store.set(key,JSON.stringify({version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'decoded'},after:{summary:'decoded'}}]}));
assert.equal(JSON.parse(execute('status').response.body).events[0].before.available,false);store.set(key,originalStore);
for(const options of [{},{method:'POST'},{method:'GET',headers:{'X-Stash-Banner-Action':'reset'}}])assert.equal(execute('reset',options).response.status,405);
assert.equal(execute('reset',{method:'POST',headers:{'x-stash-banner-action':'reset'},failWrite:true}).response.status,503);
const reset=execute('reset',{method:'POST',headers:{'x-stash-banner-action':'reset'}});assert.equal(reset.response.status,200);assert.deepEqual(reset.writes,[key,'bili.stash.banner.transport.v1']);assert.equal(store.get('unrelated.setting'),'keep');
assert.equal(JSON.parse(execute('status').response.body).events.length,0);
assert.equal(execute('other').response.status,404);

// Execute the actual inline UI script with a tiny DOM: dynamic data must be
// inserted through textContent, never HTML, and failures cannot become no-hit.
class Element {
  children=[];handlers={};textContent='';disabled=false;
  append(child){this.children.push(child);}replaceChildren(){this.children=[];}
  addEventListener(type,handler){this.handlers[type]=handler;}
  set innerHTML(_){throw Error('dynamic HTML insertion is forbidden');}
}
const script=page.response.body.match(/<script>([\s\S]*?)<\/script>/)[1];
async function ui(initial,{readFailure=false,resetFailure=false,checkFailure=false}={}) {
  const elements=Object.fromEntries(['notice','results','raw','start','refresh','transport','paths','copy'].map(id=>[id,new Element()])),calls=[];
  let data=initial,copied=null;
  const context={navigator:{clipboard:{writeText:async text=>{copied=text;}}},document:{getElementById:id=>elements[id],createElement:()=>new Element()},fetch:async(url,options)=>{
    calls.push({url,options});assert(['/x/stash-banner/status','/x/stash-banner/reset','https://app.bilibili.com/x/stash-banner/check'].includes(url));assert.equal(options.credentials,'omit');
    if(url.endsWith('/check'))return {ok:!checkFailure,json:async()=>({probe:'app-request',saved:!checkFailure})};
    if(url.endsWith('/reset')){if(resetFailure)return {ok:false,json:async()=>({cleared:false})};data={version:1,windowSeconds:60,events:[]};return {ok:true,json:async()=>({cleared:true})};}
    if(readFailure)throw Error('offline');return {ok:true,json:async()=>data};
  }};
  vm.runInNewContext(script,context);for(let i=0;i<12;i++)await Promise.resolve();return {elements,calls,getCopied:()=>copied};
}
const rendered=await ui(report);assert.equal(rendered.elements.results.children[0].children[0].textContent,'统一视频详情');assert(rendered.elements.results.children[0].children[1].textContent.includes('1 → 0'));
await rendered.elements.start.handlers.click();assert(rendered.elements.notice.textContent.includes('本轮已开始'));assert.equal(rendered.calls.at(-3).options.method,'POST');assert.equal(rendered.calls.at(-2).url,'https://app.bilibili.com/x/stash-banner/check');
const missing=await ui({version:1,windowSeconds:60,events:[]});assert(missing.elements.results.children[0].textContent.includes('不能确定接口域名'));
const unknown=await ui({version:1,windowSeconds:60,events:[{route:'view',event:'processed',before:{available:false},after:{available:false}}]});assert(unknown.elements.results.children[0].children[1].textContent.includes('计数未知'));
const failed=await ui(report,{readFailure:true});assert(failed.elements.notice.textContent.includes('读取失败'));assert(failed.elements.results.children[0].textContent.includes('不能判断为未命中'));
const badReset=await ui(report,{resetFailure:true});await badReset.elements.start.handlers.click();assert(badReset.elements.notice.textContent.includes('开始失败'));
const badCheck=await ui(report,{checkFailure:true});await badCheck.elements.start.handlers.click();assert(badCheck.elements.notice.textContent.includes('自检未通过'));
const transportReport={version:1,windowSeconds:60,events:[],transport:{storageState:'ready',armed:true,windowSeconds:600,remainingSeconds:590,selfCheckAgeSeconds:10,requests:[{route:'app-json',ageSeconds:5}],responses:[{route:'viewunite',ageSeconds:2}],paths:[{host:'app',path:'/x/v2/view/material',requestAgeSeconds:5,responseHeaderAgeSeconds:2,status:200}]}};
const transportUI=await ui(transportReport);assert(transportUI.elements.transport.children.some(line=>line.textContent.includes('统一视频详情')));assert(transportUI.elements.transport.children.some(line=>line.textContent.includes('Safari 自检')));assert(transportUI.elements.paths.children[0].textContent.includes('/x/v2/view/material'));await transportUI.elements.copy.handlers.click();assert.equal(JSON.parse(transportUI.getCopied()).transport.paths[0].status,200);
assert(!/<(?:script|link|img)\b[^>]+(?:src|href)\s*=/i.test(page.response.body),'no external page assets');
console.log('PASS banner dashboard: frozen filtering/hosts, normal Chronos, local endpoints, scoped reset, HTML/CSP/redaction, UI empty/error/unknown states and no external requests');

// Independent request runtime: arm-only, metadata-only, bounded, no request
// replay, no body/header access; the synthetic check is not a business hit.
const transportKey='bili.stash.banner.transport.v1';
let clock=Date.now();
class ClockDate extends Date{static now(){return clock;}}
function request(url,{method='POST',failRead=false,failWrite=false,runtime=requestSource,responseStatus=200}={}){
  let output,calls=0,writes=0;
  const req={url,method};for(const name of ['headers','body'])Object.defineProperty(req,name,{get(){throw Error('request content must not be read');}});
  const resp={status:responseStatus};for(const name of ['headers','body'])Object.defineProperty(resp,name,{get(){throw Error('response content must not be read');}});
  vm.runInNewContext(runtime,{$request:req,$response:resp,Date:ClockDate,$persistentStore:{read:k=>{if(failRead)throw Error('no storage');return store.get(k)??null;},write:(v,k)=>{writes++;assert.equal(k,transportKey);if(failWrite)return false;store.set(k,v);return true;}},$done:value=>{calls++;output=structuredClone(value);}}, {timeout:1000});
  assert.equal(calls,1);assert(!JSON.stringify([...store.values()]).includes(secret));return {output,writes};
}
function arm(){store.set(transportKey,JSON.stringify({version:1,startedAt:clock,selfCheckAt:null,requests:[],responses:[]}));}
store.delete(transportKey);
assert.deepEqual(request('https://app.bilibili.com/x/test?token='+secret).output,{});assert(!store.has(transportKey));
arm();const url='https://app.bilibili.com/bilibili.app.viewunite.v1.View/View?token='+secret;
assert.deepEqual(request(url).output,{});let metadata=JSON.parse(store.get(transportKey));assert.equal(metadata.requests[0].route,'viewunite');assert.equal(metadata.selfCheckAt,null);
assert.equal(request(url).writes,0,'repeat category is throttled without buffering');
clock+=6000;assert.equal(request(url).writes,1);
for(let i=0;i<80;i++)request('https://api.bilibili.com/x/unknown/'+i+'?token='+secret);
metadata=JSON.parse(store.get(transportKey));assert.equal(metadata.requests.length,2);assert(!JSON.stringify(metadata).includes('unknown'));assert(!JSON.stringify(metadata).includes('bilibili.com'));
const checked=request('https://app.bilibili.com/x/stash-banner/check',{method:'GET'});assert.equal(checked.output.response.status,200);assert.equal(checked.output.response.headers['Access-Control-Allow-Origin'],'https://api.bilibili.com');
assert.equal(JSON.parse(store.get(transportKey)).requests.length,2,'Safari self-check is separate from request presence');
const status=JSON.parse(execute('status',{date:ClockDate}).response.body);assert.equal(status.transport.armed,true);assert.equal(status.transport.requests.length,2);assert.equal(typeof status.transport.selfCheckAgeSeconds,'number');
assert.equal(request('https://app.bilibili.com/x/stash-banner/check',{method:'POST'}).output.response.status,503);
assert.equal(request('https://app.bilibili.com/x/stash-banner/check',{method:'GET',failWrite:true}).output.response.status,503);
assert.deepEqual(request(url,{failRead:true}).output,{});assert.deepEqual(request(url,{failWrite:true}).output,{});
clock+=600001;assert.equal(request(url).writes,0,'recording stops after the arm window');
const readContext=vm.createContext({Date:ClockDate,$persistentStore:{read:k=>store.get(k)??null}});vm.runInContext(read('src/stash-banner-transport.js'),readContext);
assert.equal(vm.runInContext("stashBannerTransport('read').armed",readContext),false);
store.set(transportKey,'{broken');assert.equal(JSON.parse(execute('status').response.body).transport.storageState,'unavailable');
assert.deepEqual(request(url).output,{});arm();

// Safe path shapes preserve useful static interface words and erase all other
// segments, query values, numeric IDs and arbitrary tokens before persistence.
const pathURL='https://app.bilibili.com/x/v2/view/material/123456/'+secret+'?token='+secret;
assert.deepEqual(request(pathURL).output,{});
assert.deepEqual(request(pathURL,{runtime:observerSource,responseStatus:202}).output,{});
let paths=JSON.parse(store.get(transportKey)).paths;assert.equal(paths[0].path,'/x/v2/view/material/_/_');assert.equal(paths[0].status,202);assert.equal(paths[0].requestAt,clock);assert.equal(paths[0].responseAt,clock);
assert.equal(request(pathURL,{runtime:observerSource}).writes,0,'header observation is bounded independently');
const pathStatus=JSON.parse(execute('status',{date:ClockDate}).response.body);assert.equal(pathStatus.transport.paths[0].status,202);assert.equal(pathStatus.transport.responses.length,0,'a received REST header is not a protobuf filter entry');
assert.deepEqual(request(pathURL,{runtime:observerSource,failRead:true}).output,{});
assert.deepEqual(request(pathURL,{runtime:observerSource,failWrite:true}).output,{});
const words=['view','ad','material','config','player','detail','archive','reply'];
for(const a of words)for(const b of words)request('https://api.bilibili.com/x/'+a+'/'+b);
let bounded=JSON.parse(store.get(transportKey));assert.equal(bounded.paths.length,48);assert.equal(bounded.pathLimitReached,true);assert(store.get(transportKey).length<32768);
bounded.paths[0].path='/x/'+secret;store.set(transportKey,JSON.stringify(bounded));assert.equal(JSON.parse(execute('status',{date:ClockDate}).response.body).transport.storageState,'unavailable');arm();

// The real full response worker keeps identical wire output and records its
// entry even outside the five detail-summary routes. A broken store fails open.
const globals={Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout};
const baseSource=read(full['script-providers'][oldHook.name].url.slice(rawBase.length));
const codecs=vm.createContext({...globals,console:{log(){}},$request:null});vm.runInContext(baseSource.replace(/mn\.run\(\);\s*$/,''),codecs);
const type=vm.runInContext('Lt',codecs),bytes=type.toBinary(type.create({cm:new Uint8Array([1])}));
const body=new Uint8Array(5+bytes.length);new DataView(body.buffer).setUint32(1,bytes.length,false);body.set(bytes,5);
async function response(runtime,path,{brokenStore=false}={}){
  let finish,count=0;const done=new Promise(resolve=>finish=resolve),local=new Map([[transportKey,JSON.stringify({version:1,startedAt:Date.now(),selfCheckAt:null,requests:[],responses:[]})]]);
  vm.runInNewContext(runtime,{...globals,console:{log(){}},$request:{url:'https://app.bilibili.com/bilibili.'+path,method:'POST',headers:{'content-type':'application/grpc'},body:new Uint8Array()},$response:{status:200,headers:{},body},$argument:probeHook.argument,$persistentStore:{read:k=>{if(brokenStore)throw Error('store unavailable');return local.get(k)??null;},write:(v,k)=>{if(brokenStore)throw Error('store unavailable');local.set(k,v);return true;}},$done:value=>{count++;finish(structuredClone(value));},$httpClient:{get(){throw Error('unexpected external request');}}},{timeout:1500});
  let timer;const output=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('response hung')),3000);})]).finally(()=>clearTimeout(timer));assert.equal(count,1);return {output,local};
}
for(const path of ['app.viewunite.v1.View/View','app.show.v1.Popular/Index']){
  const baseline=await response(baseSource,path),observed=await response(responseSource,path);
  assert.deepEqual(observed.output,baseline.output);assert.equal(JSON.parse(observed.local.get(transportKey)).responses.length,1);
  const broken=await response(responseSource,path,{brokenStore:true});assert.deepEqual(broken.output,baseline.output);
}
console.log('PASS transport diagnostics: scoped request/response entry markers, native exclusion, arm/expiry/throttle, independent app check, safe path shapes/header-only observer/copy, metadata privacy and unchanged wire output on storage failure');
