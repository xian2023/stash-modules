import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import YAML from 'yaml';

const read=p=>fs.readFileSync(p,'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const manifest=JSON.parse(read('modules/Bilibili_banner_diagnostic.manifest.json'));
const full=YAML.parse(read(manifest.baseline.module)),text=read(manifest.module),config=YAML.parse(text);
assert.equal(manifest.exclusive,true);assert.equal(config.version,manifest.version);assert.equal(sha(text),manifest.sha256);
assert.equal(sha(read(manifest.baseline.module)),manifest.baseline.sha256);
assert.equal(manifest.baseline.sha256,'bdfc9e53c726817ec0d29450b678524ef4e0a0174466a570e4aecb3e0c150939');
const baseHook=full.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
const hook=config.http.script.find(h=>h.name.startsWith('bili-banner-probe-'));
const normalized=structuredClone(config);
for(const key of ['name','desc','version'])normalized[key]=full[key];
normalized.http.script.find(h=>h.name===hook.name).name=baseHook.name;
delete normalized['script-providers'][hook.name];
normalized['script-providers'][baseHook.name]=structuredClone(full['script-providers'][baseHook.name]);
assert.deepEqual(normalized,full,'diagnostic may change only metadata and response provider');
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
const source=read(manifest.script.url.slice(rawBase.length)),baseSource=read(manifest.script.baseUrl.slice(rawBase.length));
assert.equal(sha(source),manifest.script.sha256);assert.equal(sha(baseSource),manifest.script.baseSha256);
assert.equal(config['script-providers'][hook.name].url,manifest.script.url);
assert(!config.http.mitm.includes('grpc.biliapi.net'));
const globals={Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout};
const codecContext=vm.createContext({...globals,console:{log(){}},$request:null});
vm.runInContext(baseSource.replace(/mn\.run\(\);\s*$/,''),codecContext);
const codec=name=>vm.runInContext(name,codecContext);
const frame=(bytes,compressed=false)=>{const payload=compressed?gzipSync(bytes):bytes,out=new Uint8Array(5+payload.length);out[0]=compressed?1:0;new DataView(out.buffer).setUint32(1,payload.length,false);out.set(payload,5);return out;};
const varint=n=>{const result=[];while(n>127){result.push((n&127)|128);n=Math.floor(n/128);}result.push(n);return Buffer.from(result);};
const unknown=value=>Buffer.concat([varint((100<<3)|2),varint(value.length),value]);
const secret='NEVER_LOG_QUERY_HEADERS_OR_BODY_7e94';
async function run(runtime,path,body,{headers={},brokenLogger=false,query=''}={}) {
  let resolve,doneCount=0;const done=new Promise(r=>{resolve=r;});const logs=[],network=[];
  const request={url:`https://app.bilibili.com/bilibili.${path}`+query,method:'POST',headers:{'content-type':'application/grpc','x-bili-moss-engine-type':'1',Cookie:secret,Authorization:secret},body:new Uint8Array()};
  const context={...globals,console:{log(...args){if(brokenLogger)throw Error('logger unavailable');logs.push(args.join(' '));}},$request:request,$response:{status:200,headers,body},$argument:hook.argument,
    $persistentStore:{read(){return null;},write(){return true;}},$httpClient:{},$notification:{post(){}},$done:out=>{doneCount++;resolve(out);}};
  for(const method of ['get','post'])context.$httpClient[method]=(options,callback)=>{network.push(options);callback('unexpected network');};
  vm.runInNewContext(runtime,context,{timeout:1500});let timer;
  const output=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No diagnostic completion')),4000);})]).finally(()=>clearTimeout(timer));
  assert.equal(doneCount,1);assert.equal(network.length,0);assert(!logs.join('\n').includes(secret));
  const summaries=logs.filter(line=>line.startsWith('[BiliBanner] ')).map(line=>JSON.parse(line.slice('[BiliBanner] '.length)));
  return {output:structuredClone(output),summaries};
}
const ad=new Uint8Array(Buffer.from(secret));
const fixtures=[
  ['app.view.v1.View/View','ft',{cmConfig:ad,cms:[ad],relates:[{}, {cm:ad}]}],
  ['app.viewunite.v1.View/View','Lt',{cm:ad,tab:{tabModule:[{tab:{oneofKind:'introduction',introduction:{modules:[{type:18}]}}}]}}],
  ['app.view.v1.View/RelatesFeed','dt',{list:[{}, {cm:ad}]}],
  ['app.viewunite.v1.View/RelatesFeed','$t',{relates:[{relateCardType:1},{relateCardType:5,cmStock:ad}]}],
  ['app.viewunite.v1.View/AIRelateAsync','jt',{cm:ad,module:{modules:[{type:18}]}}],
];
for(const [path,name,input] of fixtures) {
  const type=codec(name),data=Buffer.concat([type.toBinary(type.create(input)),unknown(Buffer.from(secret))]);
  for(const compressed of [false,true]) {
    const headers=compressed?{'grpc-encoding':'gzip'}:{};
    const a=await run(baseSource,path,frame(data,compressed),{headers}),b=await run(source,path,frame(data,compressed),{headers});
    assert.deepEqual(b.output,a.output,'probe must preserve complete filter result');
    assert.deepEqual(b.summaries.map(s=>s.event),['script-start','hit','processed']);
    const result=b.summaries.at(-1);assert.equal(result.before.summary,'decoded');assert.equal(result.after.summary,'decoded');
    assert(result.before.unknownFields.some(f=>f.no===100&&f.wireType===2));
    if(result.before.cm!==undefined){assert.equal(result.before.cm,true);assert.equal(result.after.cm,false);}
    if(result.before.relates){assert.equal(result.before.relates.count,2);assert.equal(result.after.relates.count,1);}
  }
}
const type=codec('Lt'),plain=Buffer.concat([type.toBinary(type.create({cm:ad})),unknown(Buffer.from(secret))]);
const queried=await run(source,'app.viewunite.v1.View/View',frame(plain),{query:'?token='+secret});assert(queried.summaries.length>0);
const large=Buffer.concat([type.toBinary(type.create({cm:ad})),unknown(Buffer.alloc(270000,65))]);
const largeBase=await run(baseSource,'app.viewunite.v1.View/View',frame(large));
const largeProbe=await run(source,'app.viewunite.v1.View/View',frame(large));
assert.deepEqual(largeProbe.output,largeBase.output);assert.equal(largeProbe.summaries.at(-1).before.summary,'over-256KiB');
for(const [body,headers,stage] of [[new Uint8Array([0,0]),{},'framing'],[frame(new Uint8Array([0xff])),{},'handler'],[frame(new Uint8Array()),{'grpc-status':'7'},'framing']]) {
  const a=await run(baseSource,'app.viewunite.v1.View/View',body,{headers}),b=await run(source,'app.viewunite.v1.View/View',body,{headers});
  assert.deepEqual(b.output,a.output);assert.equal(Object.keys(b.output).length,0);assert.equal(b.summaries.at(-1).event,'fail-open');assert.equal(b.summaries.at(-1).stage,stage);
}
const noLogger=await run(source,'app.viewunite.v1.View/View',frame(plain),{brokenLogger:true});
const original=await run(baseSource,'app.viewunite.v1.View/View',frame(plain));assert.deepEqual(noLogger.output,original.output);
for(const [path,name] of [['main.community.reply.v1.Reply/MainList','tn'],['app.viewunite.v1.View/ViewProgress','Mt']]) {
  const type=codec(name),body=frame(type.toBinary(type.create()));
  const a=await run(baseSource,path,body),b=await run(source,path,body);assert.deepEqual(b.output,a.output);assert.equal(b.summaries.length,0);
}
console.log('PASS banner probe: identical filters/hosts and wire output, five route summaries, secret-free counts/field IDs, bounded decode, failure and logger passthrough, no extra requests');
