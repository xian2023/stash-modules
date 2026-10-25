import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new globalThis.URL('../src/stash-sponsor-worker.js',import.meta.url),'utf8');
const URL='https://api.bilibili.com/x/stash-airborne/segments?aid=170001&cid=123';
const KEY='bili.stash.sponsor.v2';
function run({store=new Map(),url=URL,method='GET',readFail=false,writeFail=false,noClearTimeout=false}={}) {
  const calls=[],outputs=[],timers=new Map();let callback,now=1000000,serial=0;
  const sandbox={Date:{now:()=>now},Math,BigInt,JSON,Number,Object,Array,String,Error,clearTimeout:id=>timers.delete(id),setTimeout:(cb,ms)=>{assert.equal(ms,1200);timers.set(++serial,cb);return serial},$request:{url,method,headers:{Cookie:'secret',Authorization:'secret'}},$persistentStore:{read:key=>{if(readFail)throw Error();return store.get(key)},write:(value,key)=>{if(writeFail)return false;store.set(key,value);return true}},$httpClient:{get:(options,cb)=>{calls.push(options);callback=cb}},$done:value=>outputs.push(value)};
  if (noClearTimeout) delete sandbox.clearTimeout;
  vm.runInNewContext(source,sandbox);
  return {calls,outputs,store,reply:(status,body,error=null)=>callback(error,{status},body),timeout:()=>{for(const cb of [...timers.values()])cb()},body:()=>JSON.parse(outputs[0].response.body),advance:ms=>{now+=ms}};
}
const skip=(start,end)=>({actionType:'skip',segment:[start,end]});
let r=run();assert.equal(r.outputs.length,0);assert.equal(r.calls.length,1);assert.equal(r.calls[0].timeout,1);assert.equal(r.calls[0]['auto-cookie'],false);assert.deepEqual(Object.keys(r.calls[0].headers).sort(),['origin','x-ext-version']);assert.match(r.calls[0].url,/videoID=BV17x411w7KC&cid=123&category=sponsor$/);r.reply(200,JSON.stringify([skip(20,30),skip(1,9),skip(1,9),skip(0,7),skip(-1,30),skip(0,2147484),{actionType:'mute',segment:[2,50]},skip('1',20)]));assert.deepEqual(r.body(),[[1,9],[20,30]]);assert.equal(r.outputs[0].response.status,200);assert.equal(r.outputs[0].response.headers['Cache-Control'],'no-store');
assert.equal(Object.values(JSON.parse(r.store.get(KEY)).entries)[0].until,22600000);
const saved=r.store.get(KEY);r.reply(200,'[]');assert.equal(r.outputs.length,1);assert.equal(r.store.get(KEY),saved);
let cached=run({store:r.store});assert.equal(cached.calls.length,0);assert.deepEqual(cached.body(),[[1,9],[20,30]]);
let cross=run({store:r.store,url:URL.replace('cid=123','cid=124')});assert.equal(cross.calls.length,1);cross.reply(404,'');assert.deepEqual(cross.body(),[]);assert.equal(Object.values(JSON.parse(r.store.get(KEY)).entries).find(v=>!v.segments.length).until,1600000);assert.equal(run({store:r.store,url:URL.replace('cid=123','cid=124')}).calls.length,0);
for(const url of [URL+'&a=1',URL+'&cid=2',URL.replace('170001','0'),URL.replace('170001','01'),URL.replace('170001','2251799813685248'),URL.replace('123','9223372036854775808'),URL.replace('https:','http:'),URL.replace('api.bilibili.com','evil.test'),URL+'#x',URL.replace('aid=170001&cid=123','cid=123&aid=170001')]) {r=run({url});assert.equal(r.calls.length,0,url);assert.deepEqual(r.body(),[])}
r=run({method:'POST'});assert.equal(r.calls.length,0);assert.deepEqual(r.body(),[]);
for(const body of ['bad','{}','x'.repeat(131073),JSON.stringify([{padding:'汉'.repeat(50000)}])]) {r=run();r.reply(200,body);assert.deepEqual(r.body(),[]);const state=JSON.parse(r.store.get(KEY));assert.equal(state.retryAfter,1030000);assert.equal(Object.values(state.entries)[0].until,1060000)}
r=run();r.reply(503,'');assert.deepEqual(r.body(),[]);assert.equal(run({store:r.store,url:URL.replace('123','124')}).calls.length,0);
r=run();const concurrent=run({store:r.store});assert.equal(concurrent.calls.length,0);r.timeout();assert.deepEqual(r.body(),[]);const failed=r.store.get(KEY);r.reply(200,JSON.stringify([skip(0,10)]));assert.equal(r.outputs.length,1);assert.equal(r.store.get(KEY),failed);
for(const opts of [{readFail:true},{writeFail:true}]) {r=run(opts);assert.equal(r.calls.length,0);assert.deepEqual(r.body(),[])}
r=run();r.reply(200,JSON.stringify(Array.from({length:120},(_,i)=>skip(i*10,i*10+8))));assert.equal(r.body().length,100);
const store=new Map([[KEY,JSON.stringify({entries:Object.fromEntries(Array.from({length:70},(_,i)=>['BVtest:'+i,{until:2000000+i,segments:[]}]))})]]);r=run({store});r.reply(200,'[]');assert.equal(Object.keys(JSON.parse(store.get(KEY)).entries).length,64);
for (const corrupt of ['{bad','null','[]','42',JSON.stringify({entries:'bad',retryAfter:99999999}),JSON.stringify({entries:[]})]) {
  r=run({store:new Map([[KEY,corrupt]])});assert.equal(r.calls.length,1);r.reply(200,'[]');assert.deepEqual(r.body(),[]);assert.ok(JSON.parse(r.store.get(KEY)).entries);
}
r=run({noClearTimeout:true});r.reply(200,JSON.stringify([skip(1,10)]));assert.deepEqual(r.body(),[[1,10]]);const noClearSaved=r.store.get(KEY);r.timeout();assert.equal(r.outputs.length,1);assert.equal(r.store.get(KEY),noClearSaved);
r=run({store:new Map([['bili.stash.sponsor.v1',JSON.stringify({retryAfter:99999999,entries:{}})]])});assert.equal(r.calls.length,1);r.reply(404,'');
console.log('PASS sponsor worker: validation, shared cache/CID isolation, leases/breaker, timeout/late callbacks, bounds, synthetic responses and no auth forwarding');
