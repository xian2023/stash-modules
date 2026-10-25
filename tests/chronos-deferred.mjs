import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const source=fs.readFileSync('src/chronos-deferred.js','utf8');
const install=vm.runInNewContext(`(${source})`,{Map,Set,Date,Number,Math,JSON});
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
function fixture() {
  let wall=0,next=0,running=true;
  const tasks=new Map(),requests=[],seeks=[];
  let workListener,playerListener,eventListener;
  const info={isReady:true,workId:'170001',videoId:'111111',duration:1000000};
  const manager={workInfo:info,addListener(listener){workListener=listener;return 'work';},removeListener(){workListener=null;}};
  const player={currentTime:0,playbackRate:1,seekTo(time){seeks.push(time);this.currentTime=time;},addListener(listener){playerListener=listener;return 'player';},removeListener(){playerListener=null;}};
  const context={workinfoManager:manager,videoPlayer:player,addEventListener(listener){eventListener=listener;}};
  const bridge={now:()=>wall,running:()=>running,schedule(fn,seconds,repeat){const id=++next;tasks.set(id,{fn,due:wall+seconds*1000,period:repeat?seconds*1000:0});return id;},cancel:id=>tasks.delete(id),request(url,callback){requests.push({url,callback});}};
  const dispose=install(context,bridge);
  function advance(seconds,{progress=true}={}) {
    for(let i=0;i<seconds;i++) {
      wall+=1000;if(progress && player.playbackRate>0)player.currentTime+=player.playbackRate;
      for(const [id,task] of [...tasks]) if(task.due<=wall && tasks.has(id)) {
        if(task.period)task.due+=task.period;else tasks.delete(id);task.fn();
      }
    }
  }
  function switchWork(aid='170002',cid='222222') {
    workListener.onWorkWillChange();info.isReady=false;workListener.onCurrentWorkChanged();
    info.workId=aid;info.videoId=cid;player.currentTime=0;
    info.isReady=true;workListener.onCurrentWorkInfoChanged();
  }
  return {context,bridge,info,player,requests,seeks,tasks,advance,switchWork,dispose,
    reply:(ranges,index=requests.length-1,extra={})=>requests[index].callback({content:JSON.stringify(ranges),...extra}),
    pause(){player.playbackRate=0;playerListener.onPlaybackRateChanged();},resume(){player.playbackRate=1;playerListener.onPlaybackRateChanged();},
    running(value){running=value;eventListener.onRunningStateChanged(value);},
    seek(time){player.currentTime=time;playerListener.onSeeked();}
  };
}

test('No lookup during startup; one independent request only after eight seconds of advancing playback',()=>{
  const f=fixture();assert.equal(f.requests.length,0);f.advance(7);assert.equal(f.requests.length,0);f.advance(1);assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,'https://api.bilibili.com/x/stash-airborne/segments?aid=170001&cid=111111');
  f.advance(30);assert.equal(f.requests.length,1);assert.equal(f.seeks.length,0);
});
test('Middle advertisement is monitored and skipped only when its range is reached',()=>{
  const f=fixture();f.advance(8);f.reply([[30,50]]);assert.equal(f.seeks.length,0);
  f.advance(23);assert.equal(f.seeks.length,0);f.advance(1);assert.deepEqual(f.seeks,[50]);
});
test('An asynchronously returned range already in progress can still skip immediately',()=>{
  const f=fixture();f.advance(8);f.advance(2);f.reply([[0,30]]);assert.deepEqual(f.seeks,[30]);
});
test('Ranges already passed never seek backwards; later ranges remain active',()=>{
  const f=fixture();f.seek(50);f.advance(8);f.reply([[0,30],[70,90]]);assert.equal(f.seeks.length,0);
  f.advance(14);assert.deepEqual(f.seeks,[90]);
});
test('No query while paused, not running, or with non-advancing playback',()=>{
  const f=fixture();f.pause();f.advance(20);assert.equal(f.requests.length,0);f.resume();f.running(false);f.advance(20);assert.equal(f.requests.length,0);
  f.running(true);f.advance(20,{progress:false});assert.equal(f.requests.length,0);f.advance(8);assert.equal(f.requests.length,1);
});
test('Pause and seek reset the warmup interval instead of querying during reload',()=>{
  const f=fixture();f.advance(7);f.pause();f.advance(10);f.resume();f.advance(7);assert.equal(f.requests.length,0);f.seek(200);f.advance(7);assert.equal(f.requests.length,0);f.advance(1);assert.equal(f.requests.length,1);
});
test('Stale lookup after switching video cannot skip the new video or cancel its lookup',()=>{
  const f=fixture();f.advance(8);f.switchWork();f.advance(8);assert.equal(f.requests.length,2);
  f.reply([[0,30]],0);assert.equal(f.seeks.length,0);f.reply([[0,40]],1);assert.deepEqual(f.seeks,[40]);
});
test('Returning to the same aid/CID still rejects a callback from an older generation',()=>{
  const f=fixture();f.advance(8);f.switchWork();f.switchWork('170001','111111');f.advance(8);
  f.reply([[0,30]],0);assert.equal(f.seeks.length,0);f.reply([[0,40]],1);assert.deepEqual(f.seeks,[40]);
});
test('Native expired replies, malformed data and hung requests cannot seek',()=>{
  for(const value of ['<html>','{}','[["0",30]]','[[0,4]]','[[-1,30]]','[[0,1e100]]']) {
    const f=fixture();f.advance(8);f.requests[0].callback({content:value});assert.equal(f.seeks.length,0);
  }
  const expired=fixture();expired.advance(8);expired.reply([[0,30]],0,{expired:true});assert.equal(expired.seeks.length,0);
  const late=fixture();late.advance(8);late.advance(5);late.reply([[0,40]]);assert.equal(late.seeks.length,0);
});
test('Merging overlapping ranges prevents repeated partial seeks; manual undo is respected',()=>{
  const f=fixture();f.advance(8);f.reply([[10,30],[20,40],[10,30]]);f.advance(4);assert.deepEqual(f.seeks,[40]);
  f.seek(12);f.advance(20);assert.deepEqual(f.seeks,[40]);
});
test('Do not seek while paused or past known video duration',()=>{
  const f=fixture();f.advance(8);f.pause();f.reply([[0,30]]);assert.equal(f.seeks.length,0);f.resume();f.advance(1);assert.deepEqual(f.seeks,[30]);
  const short=fixture();short.info.duration=20000;short.advance(8);short.reply([[0,30]]);assert.equal(short.seeks.length,0);
});
test('Per-player cache remains scoped to aid/CID and never sends a second request on a cached revisit',()=>{
  const f=fixture();f.advance(8);f.reply([[100,130]]);f.switchWork();f.advance(8);assert.equal(f.requests.length,2);f.reply([]);
  f.switchWork('170001','111111');f.advance(8);assert.equal(f.requests.length,2);f.seek(102);f.advance(1);assert.deepEqual(f.seeks,[130]);
});
test('Disposal removes player/work listeners and timers, ignoring a late native response',()=>{
  const f=fixture();f.advance(8);f.dispose();assert.equal(f.tasks.size,0);f.reply([[0,30]]);assert.equal(f.seeks.length,0);
});
test('Reinstalling in one context replaces the old controller and backgrounding stops polling',()=>{
  const f=fixture();install(f.context,f.bridge);assert.equal(f.tasks.size,1);
  f.running(false);assert.equal(f.tasks.size,0);f.running(true);assert.equal(f.tasks.size,1);
  f.advance(8);assert.equal(f.requests.length,1);
});
test('Patched archive is valid, MD5 matches its URL, and all other resource bytes are unchanged',()=>{
  const manifest=JSON.parse(fs.readFileSync('modules/chronos.manifest.json'));
  const bytes=fs.readFileSync(manifest.path);assert.equal(crypto.createHash('md5').update(bytes).digest('hex'),manifest.md5);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert(manifest.url.endsWith(manifest.md5+'.zip'));
  const original=unzipSync(fs.readFileSync(manifest.upstream)),changed=unzipSync(bytes);
  assert.deepEqual(Object.keys(changed).sort(),Object.keys(original).sort());
  const target='res/src/danmaku/business/demand/entry_point/index_main.js';
  for(const path of Object.keys(original))if(path!==target)assert.deepEqual(changed[path],original[path]);
  const main=Buffer.from(changed[target]).toString();new vm.Script(main);
  assert(main.includes(source));assert(main.includes('uc.create({url,method:"GET",format:"raw",timeout:3,retry:1}).invoke(callback)'));
});
test('Chronos package build is byte-for-byte stable across local and UTC time zones',()=>{
  const manifest=JSON.parse(fs.readFileSync('modules/chronos.manifest.json'));
  const raw=manifest.url.slice(0,-manifest.path.length-1);
  const script=`import {buildChronos} from './scripts/build-chronos.mjs';process.stdout.write(buildChronos(${JSON.stringify(raw)}).md5);`;
  for(const TZ of ['UTC','Asia/Shanghai']) {
    const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TZ}});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,manifest.md5);
  }
});
test('Actual traced native classes preserve raw array response and seconds-to-ms seeking contracts',async()=>{
  const manifest=JSON.parse(fs.readFileSync('modules/chronos.manifest.json'));
  const original=unzipSync(fs.readFileSync(manifest.upstream));
  const main=Buffer.from(original['res/src/danmaku/business/demand/entry_point/index_main.js']).toString();
  const calls=[],pending=[];
  const box={Map,Math,Date,Promise,A:x=>typeof x==='number',L:x=>x&&typeof x==='object',I:x=>typeof x==='string',G:x=>x instanceof Error,y:x=>x===undefined,ge:x=>x==null,yt:(a,b)=>a===b,g:{i(){},e(){}},cron:{Data:class{}},Sl:{},vl:{},Lp:class{},La:class{time=0;rate=0;set(t,r){this.time=t;this.rate=r}static systemTimeMs(){return Date.now()}},Ft:class extends Error{},K:class{constructor(method,args){this.method=method;this.args=args}},ot:class{},W:{sendMessage(m,cb){calls.push(m);if(m.method==='URLRequest'){pending.push(cb);return;}return Promise.resolve({result:{current_time:0,playback_rate:1}})}}};
  vm.createContext(box);
  vm.runInContext(`var Kp;${main.slice(main.indexOf('Kp=class'),main.indexOf('Yp=class'))}globalThis.Player=Kp;`,box);
  const p=Object.create(box.Player.prototype);p._clock=new box.La();p._listeners=new Map();p.seekTo(30);await Promise.resolve();assert.equal(calls.at(-1).args.current_time,30000);
  vm.runInContext(`var Fa,uc,co,$m;class zl{constructor(e){this.expired=e}};${main.slice(main.indexOf('Fa=class ll'),main.indexOf('Bm=class'))}${main.slice(main.indexOf('$m=class extends zl'),main.indexOf('Xm=class'))}globalThis.RawRequest=uc;`,box);
  let reply;box.RawRequest.create({url:'https://api.bilibili.com/x/stash-airborne/segments?aid=170001&cid=111111',method:'GET',format:'raw',timeout:3,retry:1}).invoke(value=>reply=value);
  assert.equal(reply,undefined);assert.equal(calls.at(-1).method,'URLRequest');pending[0]({result:{code:200,content:'[[10,30]]',header:{}}});assert.deepEqual(JSON.parse(reply.content),[[10,30]]);
});

let passed=0;const results=[];
for(const [name,fn] of tests){try{await fn();passed++;results.push({name,passed:true});console.log('PASS Deferred',name);}catch(error){results.push({name,passed:false,error:String(error)});console.error('FAIL Deferred',name,error);}}
fs.writeFileSync('evidence/deferred-test-results.json',JSON.stringify({passed,total:tests.length,scope:'Node VM and traced native class mocks; no iPhone native package load',results},null,2));
console.log(`Deferred: ${passed}/${tests.length} passed`);if(passed!==tests.length)process.exitCode=1;
