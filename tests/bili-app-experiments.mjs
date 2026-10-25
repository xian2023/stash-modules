import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import YAML from 'yaml';

const read=p=>fs.readFileSync(p,'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const manifest=JSON.parse(read('modules/Bilibili_app_tests.manifest.json'));
assert.equal(manifest.exclusive,true);assert.equal(manifest.tests.length,1);
const baseline=read(manifest.baseline.module),base=YAML.parse(baseline);
assert.equal(sha(baseline),manifest.baseline.sha256);
// The exact phone-confirmed baseline is deliberately frozen across experiments.
assert.equal(sha(baseline),'67edc948f37ddd9353bbab3c133794daa4b827ac66c953b39900ca6789fc559c');
const entry=manifest.tests[0],text=read(entry.module),config=YAML.parse(text);
assert.equal(sha(text),entry.sha256);assert.equal(config.version,manifest.version);
assert(!text.includes('#!replace'));assert.equal(config.rules,undefined);
const native=structuredClone(config.http);delete native.script;
assert.deepEqual(native,base.http);
assert.equal(config.http.script.length,1);
const [hook]=config.http.script;
assert.equal(hook.type,'response');assert.equal(hook['require-body'],true);assert.equal(hook['binary-mode'],true);
assert.equal(hook.timeout,3);assert.equal(hook['max-size'],4194304);
assert.deepEqual(Object.keys(config['script-providers']),[hook.name]);
const argument=JSON.parse(hook.argument);
assert.equal(argument.sponsorBlock,false);assert.equal(argument.optimizeRequest,false);assert.equal(argument.purifyComment,false);
const matches=url=>new RegExp(hook.match).test(url);
assert.deepEqual(entry.routes,[
  'https://app.bilibili.com/bilibili.app.show.v1.Popular/Index',
  'https://app.bilibili.com/bilibili.app.dynamic.v2.Dynamic/DynAll',
  'https://app.bilibili.com/bilibili.polymer.app.search.v1.Search/SearchAll',
]);
for(const url of entry.routes) {
  assert(matches(url));assert(!matches(url.replace('app.bilibili.com','grpc.biliapi.net')));
  assert(!matches(url.replace('app.bilibili.com','app.bilibili.com.evil.example')));
  assert(!matches(url+'/extra'));
}
for(const host of ['app.bilibili.com','grpc.biliapi.net']) {
  for(const route of ['main.community.reply.v1.Reply/MainList','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList','community.service.dm.v1.DM/DmSegMobile','community.service.dm.v1.DM/DmView','app.view.v1.View/View','app.viewunite.v1.View/View','app.view.v1.View/ViewProgress','app.viewunite.v1.View/ViewProgress','app.view.v1.View/RelatesFeed','app.viewunite.v1.View/RelatesFeed','app.viewunite.v1.View/AIRelateAsync','app.playerunite.v1.Player/PlayViewUnite','app.playurl.v1.PlayURL/PlayView'])assert(!matches(`https://${host}/bilibili.${route}`));
}
assert(!matches('https://api.bilibili.com/x/stash-airborne/segments?aid=1&cid=2'));
const provider=config['script-providers'][hook.name];assert.equal(provider.url,entry.script.url);
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
assert(provider.url.startsWith(rawBase));
const source=read(provider.url.slice(rawBase.length));assert.equal(sha(source),entry.script.sha256);
const globals={Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,console:{log(){}}};
const codecContext=vm.createContext({...globals,$request:null});
vm.runInContext(source.replace(/mn\.run\(\);\s*$/,''),codecContext);
const codec=name=>vm.runInContext(name,codecContext);
const frame=(bytes,gzip=false)=>{const payload=gzip?gzipSync(bytes):bytes;const result=new Uint8Array(5+payload.length);result[0]=gzip?1:0;new DataView(result.buffer).setUint32(1,payload.length,false);result.set(payload,5);return result;};
async function run(url,body,{headers={},trailers}={}) {
  assert(matches(url));let resolve,doneCount=0;const calls=[];
  const done=new Promise(r=>{resolve=r;});
  const ctx={...globals,$request:{url,method:'POST',headers:{'content-type':'application/grpc','x-bili-moss-engine-type':'1'},body:new Uint8Array()},
    $response:{status:200,headers,body,h2_trailers:trailers},$argument:hook.argument,
    $httpClient:{},$persistentStore:{read(){return null;},write(){return true;}},$notification:{post(){}},
    $done:output=>{doneCount++;resolve(output);},
  };
  for(const method of ['get','post'])ctx.$httpClient[method]=(options,callback)=>{calls.push({method,options});callback('unexpected network');};
  vm.runInNewContext(source,ctx,{timeout:1500});let timer;
  const output=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Response never completed')),4000);})]).finally(()=>clearTimeout(timer));
  assert.equal(doneCount,1);assert.equal(calls.length,0,'response filter must not relay or fetch');
  return output;
}
const unknown=Buffer.from([0xa0,0x06,0x7b]);
const popular=codec('et'),dynamic=codec('Ee'),search=codec('yn');
const fixtures=[
  [popular,{items:[
    {item:{oneofKind:'smallCoverV5',smallCoverV5:{base:{fromType:'recommend'}}}},
    {item:{oneofKind:'smallCoverV5',smallCoverV5:{base:{fromType:'recommend',adInfo:new Uint8Array([1])}}}},
    {item:{oneofKind:'smallCoverV5Ad',smallCoverV5Ad:new Uint8Array([1])}},
  ]},out=>{assert.equal(out.items.length,1);assert.equal(out.items[0].item.smallCoverV5.base.fromType,'recommend');}],
  [dynamic,{topicList:new Uint8Array([1]),dynamicList:{list:[{cardType:1},{cardType:15},{cardType:18}]},upList:{showLiveNum:1}},out=>{assert.equal(out.topicList,undefined);assert.deepEqual(Array.from(out.dynamicList.list,x=>x.cardType),[1]);assert.equal(out.upList.showLiveNum,1);}],
  [search,{item:[{linktype:'video'},{linktype:'activity_ad'},{linktype:'video_ad_card'},{linktype:'article'}]},out=>assert.deepEqual(Array.from(out.item,x=>x.linktype),['video','article'])],
];
for(let i=0;i<fixtures.length;i++) {
  const [type,input,verify]=fixtures[i];
  const bytes=Buffer.concat([type.toBinary(type.create(input)),unknown]);
  for(const compressed of [false,true]) {
    const output=await run(entry.routes[i],frame(bytes,compressed),{headers:compressed?{'grpc-encoding':'gzip'}:{}});
    assert(output.body instanceof Uint8Array);assert.equal(output.body[0],0);
    assert(Buffer.from(output.body).includes(unknown),'preserve unknown fields, including future pagination fields');
    verify(type.fromBinary(output.body.subarray(5)));
  }
}
for(const [body,headers,trailers] of [
  [new Uint8Array([0,0]),{},undefined],
  [new Uint8Array(10),{},undefined],
  [frame(new Uint8Array()),{'grpc-status':'7'},undefined],
  [frame(new Uint8Array()),{}, {'Grpc-Status':'7'}],
  [frame(new Uint8Array([0xff])),{},undefined],
])assert.equal(Object.keys(await run(entry.routes[2],body,{headers,trailers})).length,0,'errors must keep original response');
console.log('PASS app test 01: frozen accepted baseline, exact three app-only routes, one response provider, no extra fetch, organic protobuf fixtures/gzip/unknown fields, error passthrough');
