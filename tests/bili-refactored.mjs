import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import YAML from 'yaml';

const read=path=>fs.readFileSync(path,'utf8'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const m=JSON.parse(read('modules/Bilibili_refactored.manifest.json'));
const config=YAML.parse(read(m.module)),baseline=YAML.parse(read(m.baseline.module));
assert.equal(sha(read(m.module)),m.sha256);assert.equal(config.version,m.version);
assert.equal(sha(read(m.baseline.module)),'bdfc9e53c726817ec0d29450b678524ef4e0a0174466a570e4aecb3e0c150939');
assert.deepEqual(config.http.mitm,['grpc.biliapi.net',...baseline.http.mitm]);
const response=config.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
const baseResponse=baseline.http.script.find(h=>h.name===response.name);
const normalized=structuredClone(config);
for(const field of ['name','desc','category','version'])normalized[field]=baseline[field];
normalized.http.mitm=baseline.http.mitm;
const normalizedResponse=normalized.http.script.find(h=>h.name===response.name);
normalizedResponse.match=baseResponse.match;normalizedResponse.argument=baseResponse.argument;
assert.deepEqual(normalized,baseline,'preserve full-compatible filtering/providers while restoring grpc and bypassing comments');
assert.equal(m.responseRoutes.length,14);assert.equal(JSON.parse(response.argument).purifyComment,false);assert.equal(JSON.parse(response.argument).optimizeRequest,false);
const match=(pattern,url)=>new RegExp(pattern.replace(/^\(\?i\)/,''),'i').test(url);
const hooks=url=>config.http.script.filter(h=>match(h.match,url));
assert.equal(config.http.script.filter(h=>h.type==='request').length,1);
assert(config.http.script.find(h=>h.type==='request').name.startsWith('bili-airborne-worker-'));
for(const host of m.responseHosts){
  for(const route of m.responseRoutes){
    const url=`https://${host}/bilibili.${route}`;assert.deepEqual(hooks(url).map(h=>h.type),['response']);assert.equal(hooks(url+'/extra').length,0);
  }
  for(const route of ['main.community.reply.v1.Reply/MainList','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList','community.service.dm.v1.DM/DmSegMobile']){
    const url=`https://${host}/bilibili.${route}`;
    assert.equal(hooks(url).length,0);assert(config.http.mock.every(mock=>!match(mock.match,url)));
    assert(config.http['body-rewrite'].every(row=>!match(row.split(/\s+/)[0],url)));
  }
}
for(const host of ['grpc.biliapi.net.evil.example','api.bilibili.com'])assert.equal(hooks(`https://${host}/bilibili.app.view.v1.View/View`).length,0);
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
for(const [url,hash] of Object.entries({...m.scripts,...m.assets}))assert.equal(sha(fs.readFileSync(url.slice(rawBase.length))),hash);
const source=read(config['script-providers'][response.name].url.slice(rawBase.length));
assert(!source.includes('stashBannerTransport'));
const globals={Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,console:{log(){}}};
const codecs=vm.createContext({...globals,$request:null});vm.runInContext(source.replace(/mn\.run\(\);\s*$/,''),codecs);
const codec=name=>vm.runInContext(name,codecs);
const frame=(bytes,compressed)=>{const payload=compressed?gzipSync(bytes):bytes,body=new Uint8Array(5+payload.length);body[0]=compressed?1:0;new DataView(body.buffer).setUint32(1,payload.length,false);body.set(payload,5);return body;};
async function run(host,route,body,headers={}){
  const url=`https://${host}/bilibili.${route}`;assert.equal(hooks(url)[0],response);
  let finish,count=0;const calls=[];const done=new Promise(resolve=>finish=resolve);
  const context={...globals,$request:{url,method:'POST',headers:{'content-type':'application/grpc','x-bili-moss-engine-type':'1'},body:new Uint8Array()},$response:{status:200,headers,body},$argument:response.argument,
    $persistentStore:{read(){return null;},write(){return true;}},$httpClient:{get(options,callback){calls.push('get');callback('unexpected lookup');},post(options,callback){calls.push('post');callback('unexpected replay');}},$done:value=>{count++;finish(structuredClone(value));}};
  vm.runInNewContext(source,context,{timeout:1500});let timer;
  const output=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('worker did not finish')),3000);})]).finally(()=>clearTimeout(timer));
  assert.equal(count,1);assert.equal(calls.length,0,'response processing never performs a lookup or request replay');return output;
}
const ad=new Uint8Array([1]),unknown=Buffer.from([0xa0,0x06,0x7b]);
const cases=[
  ['app.view.v1.View/View','ft',{cmConfig:ad,cms:[ad],relates:[{}, {cm:ad}]},out=>{assert.equal(out.cmConfig,undefined);assert.equal(out.cms.length,0);assert.equal(out.relates.length,1);}],
  ['app.viewunite.v1.View/View','Lt',{cm:ad},out=>assert.equal(out.cm,undefined)],
  ['app.view.v1.View/RelatesFeed','dt',{list:[{}, {cm:ad}]},out=>assert.equal(out.list.length,1)],
  ['app.viewunite.v1.View/RelatesFeed','$t',{relates:[{relateCardType:1},{relateCardType:5,cmStock:ad}]},out=>assert.equal(out.relates.length,1)],
  ['app.viewunite.v1.View/AIRelateAsync','jt',{cm:ad},out=>assert.equal(out.cm,undefined)],
];
for(const host of m.responseHosts)for(const [route,name,input,verify] of cases)for(const compressed of [false,true]){
  const type=codec(name),bytes=Buffer.concat([type.toBinary(type.create(input)),unknown]);
  const out=await run(host,route,frame(bytes,compressed),compressed?{'grpc-encoding':'gzip'}:{});
  assert(Buffer.from(out.body).includes(unknown));verify(type.fromBinary(out.body.subarray(5)));
}
const chronos=JSON.parse(read('modules/chronos.manifest.json'));
for(const host of m.responseHosts)for(const [route,name] of [['app.view.v1.View/ViewProgress','pt'],['app.viewunite.v1.View/ViewProgress','Mt']]){
  const type=codec(name),input=type.toBinary(type.create({chronos:{file:'https://original.example/resource.zip',md5:'45b564f5ba1fdd3746406937059addd8',sign:'old'}}));
  const out=await run(host,route,frame(input)),resource=type.fromBinary(out.body.subarray(5)).chronos;
  assert.equal(resource.file,chronos.url);assert.equal(resource.md5,chronos.md5);
}
for(const host of m.responseHosts){
  assert.deepEqual(await run(host,'app.viewunite.v1.View/View',new Uint8Array([0,0])),{});
  assert.deepEqual(await run(host,'app.viewunite.v1.View/View',frame(new Uint8Array()),{'grpc-status':'7'}),{});
}
console.log('PASS refactored: restored grpc/app banner filters, no comment/nested/DM hooks or replay, unchanged native/providers, gzip/unknown/error preservation and both-host deferred Chronos routing');
