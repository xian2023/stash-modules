import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {unzipSync} from 'fflate';

const read=p=>fs.readFileSync(p,'utf8');
const manifest=JSON.parse(read('modules/Bilibili_banner_diagnostic.manifest.json'));
const ui=manifest.chronos,sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const bytes=fs.readFileSync(ui.path),baseBytes=fs.readFileSync(ui.base.path);
assert.equal(sha(bytes),ui.sha256);assert.equal(sha(baseBytes),ui.base.sha256);
assert.equal(crypto.createHash('md5').update(bytes).digest('hex'),ui.md5);
const before=unzipSync(baseBytes),after=unzipSync(bytes),entry='res/src/danmaku/business/demand/entry_point/index_main.js';
assert.deepEqual(Object.keys(before).sort(),Object.keys(after).sort());
for(const key of Object.keys(before))if(key!==entry)assert.deepEqual(after[key],before[key]);
const source=Buffer.from(after[entry]).toString('utf8');
assert(source.includes(read('src/chronos-deferred.js')));assert(source.includes(read('src/chronos-banner-diagnostic.js')));
assert(source.includes('show:text=>ct.create(1).setText(text).show()'));
// Execute the actual original ct class, not a hypothetical browser toast API.
const original=Buffer.from(before[entry]).toString('utf8'),start=original.indexOf('ct=(Gs=class'),end=original.indexOf(',Xl=',start);
assert(start>=0&&end>start);
const calls=[];
const toastBox={W:{sendMessage(message,callback){calls.push(message);callback?.({});}},K:class{constructor(method,args){this.method=method;this.args=args;}},cron:new Proxy({},{get(){throw Error('native toast must not access UI nodes');}}),g:{e(){}}};
vm.createContext(toastBox);vm.runInContext('var ct,Gs;'+original.slice(start,end)+';globalThis.Toast=ct;',toastBox);
toastBox.Toast.create(1).setText(' 横幅诊断已载入 ').setDuration(99).show();
assert.equal(calls.length,1);assert.equal(calls[0].method,'ShowToast');assert.equal(calls[0].args.message,'横幅诊断已载入');assert.deepEqual(Object.keys(calls[0].args),['message']);

const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
const statusSource=read(manifest.statusScript.url.slice(rawBase.length));assert.equal(sha(statusSource),manifest.statusScript.sha256);
assert(manifest.script.url.includes('banner-'+sha(read(manifest.script.url.slice(rawBase.length))+'\n'+statusSource).slice(0,16)+'/'));
const now=Date.now(),secret='PRIVATE_DATA_MUST_NOT_LEAVE_STORE';
function status(stored,{url='https://api.bilibili.com/x/stash-banner/status',method='GET'}={}) {
  let done,count=0;
  vm.runInNewContext(statusSource,{$request:{url,method},$persistentStore:{read(){return typeof stored==='string'?stored:JSON.stringify(stored);}},$done:result=>{count++;done=result;}});
  assert.equal(count,1);assert.equal(done.response.status,200);assert(!done.response.body.includes(secret));return JSON.parse(done.response.body);
}
const records={version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'decoded',cm:true,sampledRelatedAds:1,unknownFieldCount:99},after:{summary:'decoded',cm:false,sampledRelatedAds:0},private:secret},{at:now-61000,route:'view',event:'processed'},{at:now,route:secret,event:'processed'}]};
const report=status(records);assert.equal(report.events.length,1);assert.equal(report.events[0].before.bannerFields,1);assert.equal(report.events[0].after.bannerFields,0);assert.equal(report.events[0].before.relatedIndicators,1);
assert.equal(report.events[0].before.unknownFieldCount,undefined);
const unavailable=status({version:1,events:[{at:now,route:'viewunite',event:'processed',before:{summary:'over-256KiB'},after:{summary:'decode-failed'}}]});
assert.equal(unavailable.events[0].before.available,false);assert.equal(unavailable.events[0].before.bannerFields,undefined);
for(const input of ['broken',null,{version:1,events:[]},'x'.repeat(32769)])assert.equal(status(input).events.length,0);
assert.equal(status(records,{method:'POST'}).events.length,0);assert.equal(status(records,{url:'https://api.bilibili.com/x/stash-banner/status?token='+secret}).events.length,0);

const controller=read('src/chronos-banner-diagnostic.js');
function harness({ready=true,running=true,hang=false}={}) {
  let time=0,id=0;const tasks=new Map(),toasts=[],requests=[],listeners=[],sceneListeners=[];
  const info={isReady:ready,workId:'170001',videoId:'111111'};
  const context={workinfoManager:{workInfo:info,addListener:value=>(listeners.push(value),'listener'),removeListener(){listeners.length=0;}},addEventListener:value=>sceneListeners.push(value)};
  const bridge={running:()=>running,schedule:(fn,seconds)=>(tasks.set(++id,{at:time+seconds,fn}),id),cancel:task=>tasks.delete(task),show:text=>toasts.push({at:time,text}),request:(url,callback)=>{requests.push({url,callback});if(!hang)callback({content:JSON.stringify(report)});}};
  const box={};vm.createContext(box);vm.runInContext(controller+';globalThis.install=installStashBannerDiagnostic;',box);
  const dispose=box.install(context,bridge);
  const advance=target=>{for(;;){const next=[...tasks.entries()].filter(([,task])=>task.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;tasks.delete(next[0]);next[1].fn();}time=target;};
  return {context,info,toasts,requests,listeners,tasks,advance,dispose,setRunning:value=>{running=value;sceneListeners.forEach(listener=>listener.onRunningStateChanged());}};
}
const h=harness();assert.equal(h.toasts.length,1);assert(h.toasts[0].text.includes('播放器已载入'));assert.equal(h.requests.length,0);
h.advance(4);assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'https://api.bilibili.com/x/stash-banner/status');assert(h.toasts.at(-1).text.includes('推广字段1→0'));assert(h.toasts.at(-1).text.includes('关联标记1→0'));
h.advance(20);assert.equal(h.requests.length,2);assert.equal(h.toasts.length,2,'identical summary does not spam');
h.advance(200);assert.equal(h.requests.length,2,'no recurring polling');
const cold=harness({ready:false});assert.equal(cold.toasts.length,0);cold.info.isReady=true;cold.listeners[0].onCurrentWorkInfoChanged();assert.equal(cold.toasts.length,1);
const pending=harness({hang:true});pending.advance(4);pending.advance(7);assert(pending.toasts.at(-1).text.includes('无法读取'));const total=pending.toasts.length;pending.requests[0].callback({content:JSON.stringify(report)});assert.equal(pending.toasts.length,total,'late response after guard is ignored');
const stale=harness({hang:true});stale.advance(4);stale.listeners[0].onWorkWillChange();stale.info.videoId='222222';stale.listeners[0].onCurrentWorkInfoChanged();const shown=stale.toasts.length;stale.requests[0].callback({content:JSON.stringify(report)});assert.equal(stale.toasts.length,shown);
stale.setRunning(false);assert.equal(stale.tasks.size,0);stale.setRunning(true);assert(stale.tasks.size>0);stale.dispose();assert.equal(stale.tasks.size,0);
const none=harness({hang:true});none.advance(4);none.requests[0].callback({content:JSON.stringify({version:1,windowSeconds:60,events:[]})});assert(none.toasts.at(-1).text.includes('未记录详情命中'));assert(none.toasts.at(-1).text.includes('不能确定'));
const invalid=harness({hang:true});invalid.advance(4);invalid.requests[0].callback({content:secret});assert(invalid.toasts.at(-1).text.includes('无法读取'));assert(!invalid.toasts.at(-1).text.includes(secret));
const unknown=harness({hang:true});unknown.advance(4);unknown.requests[0].callback({content:JSON.stringify(unavailable)});assert(unknown.toasts.at(-1).text.includes('计数未知'));assert(!unknown.toasts.at(-1).text.includes('0→0'));
console.log('PASS in-Bilibili diagnostics: real ShowToast bridge, status redaction/expiry, bounded native queries, foreground/work generation, timeout/late replies, stable base ZIP and one-file patch');
