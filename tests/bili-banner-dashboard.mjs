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
const oldHook=full.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
const normalized=structuredClone(config);
for(const key of ['name','desc','version'])normalized[key]=full[key];
normalized.http.script=normalized.http.script.filter(h=>h.name!==workerHook.name);
normalized.http.script.find(h=>h.name===probeHook.name).name=oldHook.name;
delete normalized['script-providers'][probeHook.name];delete normalized['script-providers'][workerHook.name];
normalized['script-providers'][oldHook.name]=full['script-providers'][oldHook.name];
assert.deepEqual(normalized,full,'only panel endpoint and response telemetry are added');
assert.equal(workerHook['require-body'],false);
for(const path of ['dashboard','status','reset'])assert(new RegExp(workerHook.match).test('https://api.bilibili.com/x/stash-banner/'+path));
for(const url of ['https://grpc.biliapi.net/x/stash-banner/status','https://api.bilibili.com.evil.example/x/stash-banner/status','https://api.bilibili.com/x/stash-banner/status-other','https://api.bilibili.com/x/stash-banner/status?token=1'])assert(!new RegExp(workerHook.match).test(url));
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
const source=read(m.dashboardScript.url.slice(rawBase.length)),responseSource=read(m.responseScript.url.slice(rawBase.length));
assert.equal(sha(source),m.dashboardScript.sha256);assert.equal(sha(responseSource),m.responseScript.sha256);
const chronos=JSON.parse(read('modules/chronos.manifest.json'));
assert(responseSource.includes('const STASH_DEFERRED_CHRONOS = '+JSON.stringify({md5:chronos.md5,url:chronos.url})+';'));
assert(!responseSource.includes('installStashBannerDiagnostic'));
const secret='SENSITIVE_INPUT_MUST_NOT_APPEAR',now=Date.now(),key='bili.stash.banner.ui.v1';
const store=new Map([[key,JSON.stringify({version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'decoded',cm:true,sampledRelatedAds:2},after:{summary:'decoded',cm:false,sampledRelatedAds:0},private:secret}]})],['unrelated.setting','keep']]);
function execute(path,{method='GET',headers={},failWrite=false,failRead=false}={}) {
  let output,count=0,reads=0;const writes=[];
  const context={$request:{url:'https://api.bilibili.com/x/stash-banner/'+path,method,headers},$persistentStore:{read:k=>{reads++;if(failRead)throw Error('read unavailable');return store.get(k)??null;},write:(value,k)=>{writes.push(k);if(failWrite)return false;store.set(k,value);return true;}},$done:value=>{count++;output=value;}};
  vm.runInNewContext(source,context);assert.equal(count,1);assert(!output.response.body.includes(secret));return {response:structuredClone(output.response),reads,writes};
}
const page=execute('dashboard');assert.equal(page.response.status,200);assert.equal(page.reads,0);assert.equal(page.writes.length,0);assert.equal(page.response.body,read('src/banner-dashboard.html'));
assert(page.response.headers['Content-Security-Policy'].includes("default-src 'none'"));assert(page.response.headers['Content-Security-Policy'].includes("connect-src 'self'"));
assert.equal(execute('status').response.status,200);const report=JSON.parse(execute('status').response.body);assert.equal(report.events[0].before.bannerFields,1);
assert.equal(execute('status',{failRead:true}).response.status,503);
const originalStore=store.get(key);store.set(key,'{broken');assert.equal(execute('status').response.status,503);
store.set(key,JSON.stringify({version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'decoded'},after:{summary:'decoded'}}]}));
assert.equal(JSON.parse(execute('status').response.body).events[0].before.available,false);store.set(key,originalStore);
for(const options of [{},{method:'POST'},{method:'GET',headers:{'X-Stash-Banner-Action':'reset'}}])assert.equal(execute('reset',options).response.status,405);
assert.equal(execute('reset',{method:'POST',headers:{'x-stash-banner-action':'reset'},failWrite:true}).response.status,503);
const reset=execute('reset',{method:'POST',headers:{'x-stash-banner-action':'reset'}});assert.equal(reset.response.status,200);assert.deepEqual(reset.writes,[key]);assert.equal(store.get('unrelated.setting'),'keep');
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
async function ui(initial,{readFailure=false,resetFailure=false}={}) {
  const elements=Object.fromEntries(['notice','results','raw','start','refresh'].map(id=>[id,new Element()])),calls=[];
  let data=initial;
  const context={document:{getElementById:id=>elements[id],createElement:()=>new Element()},fetch:async(url,options)=>{
    calls.push({url,options});assert(['/x/stash-banner/status','/x/stash-banner/reset'].includes(url));assert.equal(options.credentials,'omit');
    if(url.endsWith('/reset')){if(resetFailure)return {ok:false,json:async()=>({cleared:false})};data={version:1,windowSeconds:60,events:[]};return {ok:true,json:async()=>({cleared:true})};}
    if(readFailure)throw Error('offline');return {ok:true,json:async()=>data};
  }};
  vm.runInNewContext(script,context);for(let i=0;i<12;i++)await Promise.resolve();return {elements,calls};
}
const rendered=await ui(report);assert.equal(rendered.elements.results.children[0].children[0].textContent,'统一视频详情');assert(rendered.elements.results.children[0].children[1].textContent.includes('1 → 0'));
await rendered.elements.start.handlers.click();assert(rendered.elements.notice.textContent.includes('本轮已开始'));assert.equal(rendered.calls.at(-2).options.method,'POST');
const missing=await ui({version:1,windowSeconds:60,events:[]});assert(missing.elements.results.children[0].textContent.includes('不能确定接口域名'));
const unknown=await ui({version:1,windowSeconds:60,events:[{route:'view',event:'processed',before:{available:false},after:{available:false}}]});assert(unknown.elements.results.children[0].children[1].textContent.includes('计数未知'));
const failed=await ui(report,{readFailure:true});assert(failed.elements.notice.textContent.includes('读取失败'));assert(failed.elements.results.children[0].textContent.includes('不能判断为未命中'));
const badReset=await ui(report,{resetFailure:true});await badReset.elements.start.handlers.click();assert(badReset.elements.notice.textContent.includes('开始失败'));
assert(!/<(?:script|link|img)\b[^>]+(?:src|href)\s*=/i.test(page.response.body),'no external page assets');
console.log('PASS banner dashboard: frozen filtering/hosts, normal Chronos, local endpoints, scoped reset, HTML/CSP/redaction, UI empty/error/unknown states and no external requests');
