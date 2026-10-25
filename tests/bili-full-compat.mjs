import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {gzipSync} from 'node:zlib';
import YAML from 'yaml';

const read=p=>fs.readFileSync(p,'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const manifest=JSON.parse(read('modules/Bilibili_compat_full_test.manifest.json'));
const text=read(manifest.module),config=YAML.parse(text);
const main=YAML.parse(read(manifest.source.module));
assert.equal(sha(text),manifest.sha256);assert.equal(manifest.exclusive,true);assert.equal(config.version,manifest.version);
assert.equal(sha(read(manifest.baseline.module)),'67edc948f37ddd9353bbab3c133794daa4b827ac66c953b39900ca6789fc559c');
assert.equal(sha(read(manifest.previousTest.module)),'68316da3ff7bc7103a38ec58f3149e868c24bebc2199f948cd6d4832a4ed64e6');
for(const source of [manifest.source,manifest.baseline,manifest.previousTest])assert.equal(sha(read(source.module)),source.sha256);
assert(!text.includes('#!replace'));
assert.deepEqual(config.http.mitm,['app.bilibili.com','api.bilibili.com','api.live.bilibili.com','line3-h5-mobile-api.biligame.com']);
assert.deepEqual(config.http['body-rewrite'],main.http['body-rewrite']);
assert.deepEqual(config.http['url-rewrite'],main.http['url-rewrite']);
assert.deepEqual(config.http.mock,main.http.mock.filter(mock=>!mock.base64));
assert.equal(config.rules.length,1);assert(config.rules[0].includes('chat.bilibili.com'));
assert(config.rules.every(rule=>!/^DOMAIN,/.test(rule)));
const rawBase='https://raw.githubusercontent.com/xian2023/stash-modules/main/';
for(const [url,hash] of Object.entries({...manifest.scripts,...manifest.assets})) {assert(url.startsWith(rawBase));assert.equal(sha(fs.readFileSync(url.slice(rawBase.length))),hash);}
const matches=(pattern,url)=>new RegExp(pattern.replace(/^\(\?i\)/,''),'i').test(url);
const hooks=url=>config.http.script.filter(hook=>matches(hook.match,url));
assert.equal(config.http.script.length,3);assert.equal(Object.keys(config['script-providers']).length,3);
for(const hook of config.http.script)assert(config['script-providers'][hook.name]);
assert.deepEqual(Object.keys(config['script-providers']).sort(),config.http.script.map(h=>h.name).sort());
const [worker]=config.http.script.filter(h=>h.type==='request');assert(worker.name.startsWith('bili-airborne-worker-'));
assert.equal(worker['require-body'],false);
const response=config.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
const argument=JSON.parse(response.argument);assert.equal(argument.sponsorBlock,true);assert.equal(argument.purifyComment,true);assert.equal(argument.optimizeRequest,false);
const allowed=[
  'app.show.v1.Popular/Index','app.dynamic.v2.Dynamic/DynAll','polymer.app.search.v1.Search/SearchAll',
  'app.view.v1.View/View','app.viewunite.v1.View/View','app.view.v1.View/RelatesFeed','app.viewunite.v1.View/RelatesFeed','app.viewunite.v1.View/AIRelateAsync','main.community.reply.v1.Reply/MainList',
  'app.view.v1.View/ViewProgress','app.viewunite.v1.View/ViewProgress','app.playurl.v1.PlayURL/PlayView','app.playerunite.v1.Player/PlayViewUnite','pgc.gateway.player.v2.PlayURL/PlayView','community.service.dm.v1.DM/DmView',
];
assert.deepEqual([...manifest.groups.contentAndComments,...manifest.groups.playerAndAirborne],allowed);
for(const path of allowed) {
  const url=`https://app.bilibili.com/bilibili.${path}`;
  assert.equal(hooks(url).length,1);assert.equal(hooks(url)[0].type,'response');
  for(const host of ['grpc.biliapi.net','api.bilibili.com','app.bilibili.com.evil.example'])assert.equal(hooks(url.replace('app.bilibili.com',host)).length,0);
  assert.equal(hooks(url+'/extra').length,0);
}
for(const host of ['grpc.biliapi.net','app.bilibili.com'])for(const path of ['community.service.dm.v1.DM/DmSegMobile','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList']) {
  const url=`https://${host}/bilibili.${path}`;assert.equal(hooks(url).length,0);
  for(const mock of config.http.mock)assert(!matches(mock.match,url));
  for(const rule of config.http['body-rewrite'])assert(!matches(rule.split(' response-jq ')[0],url));
}
assert.equal(hooks('https://app.bilibili.com/bilibili.app.view.v1.View/AIRelateAsync').length,0,'unregistered classic route stays untouched');
assert.equal(hooks('https://api.bilibili.com/x/stash-airborne/segments?aid=170001&cid=111111')[0],worker);
const responseProvider=config['script-providers'][response.name];
const source=read(responseProvider.url.slice(rawBase.length));
const globals={Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,setTimeout,clearTimeout,console:{log(){}}};
const codecContext=vm.createContext({...globals,$request:null});vm.runInContext(source.replace(/mn\.run\(\);\s*$/,''),codecContext);
const codec=name=>vm.runInContext(name,codecContext);
const frame=(bytes,gzip=false)=>{const payload=gzip?gzipSync(bytes):bytes;const out=new Uint8Array(5+payload.length);out[0]=gzip?1:0;new DataView(out.buffer).setUint32(1,payload.length,false);out.set(payload,5);return out;};
async function run(path,body,headers={}) {
  const url=`https://app.bilibili.com/bilibili.${path}`;assert.equal(hooks(url)[0],response);
  let resolve,count=0;const done=new Promise(r=>{resolve=r;});const calls=[];
  const context={...globals,$request:{url,method:'POST',headers:{'content-type':'application/grpc','x-bili-moss-engine-type':'1'},body:new Uint8Array()},$response:{status:200,headers,body},$argument:response.argument,
    $persistentStore:{read(){return null;},write(){return true;}},$httpClient:{},$notification:{post(){}},$done:out=>{count++;resolve(out);}};
  for(const method of ['get','post'])context.$httpClient[method]=(options,callback)=>{calls.push(options);callback('unexpected relay');};
  vm.runInNewContext(source,context,{timeout:1500});let timer;
  const output=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('No response completion')),4000);})]).finally(()=>clearTimeout(timer));
  assert.equal(count,1);assert.equal(calls.length,0,'Bili response filters never relay or look up airborne data');return output;
}
const bytes=new Uint8Array([1]),unknown=Buffer.from([0xa0,0x06,0x7b]);
const normalModule={type:3,data:{oneofKind:'headLine',headLine:{label:bytes}}};
const promoModule={type:18,data:{oneofKind:undefined}};
const viewuniteInput={cm:bytes,tab:{tabModule:[{tab:{oneofKind:'introduction',introduction:{modules:[normalModule,promoModule]}}}]}};
const fixtureCases=[
  ['app.view.v1.View/View','ft',{label:bytes,cmConfig:bytes,cmIpad:bytes,cms:[bytes],specialCellNew:[bytes],relates:[{}, {cm:bytes}]},out=>{for(const key of ['label','cmConfig','cmIpad'])assert.equal(out[key],undefined);assert.equal(out.cms.length,0);assert.equal(out.specialCellNew.length,0);assert.equal(out.relates.length,1);}],
  ['app.viewunite.v1.View/View','Lt',viewuniteInput,out=>{assert.equal(out.cm,undefined);const modules=out.tab.tabModule[0].tab.introduction.modules;assert.equal(modules.length,1);assert.equal(modules[0].type,3);assert.equal(modules[0].data.headLine.label,undefined);}],
  ['app.view.v1.View/RelatesFeed','dt',{list:[{}, {cm:bytes}]},out=>assert.equal(out.list.length,1)],
  ['app.viewunite.v1.View/RelatesFeed','$t',{relates:[{relateCardType:1},{relateCardType:5},{relateCardType:1,cmStock:bytes}]},out=>{assert.equal(out.relates.length,1);assert.equal(out.relates[0].relateCardType,1);}],
  ['app.viewunite.v1.View/AIRelateAsync','jt',{cm:bytes,module:{modules:[normalModule,promoModule]}},out=>{assert.equal(out.cm,undefined);assert.equal(out.module.modules.length,1);assert.equal(out.module.modules[0].type,3);}],
  ['main.community.reply.v1.Reply/MainList','tn',{cm:bytes,mixedCards:[bytes],topReplies:[],subjectTopCards:[]},out=>{assert.equal(out.cm,undefined);assert.equal(out.mixedCards.length,0);}],
  ['community.service.dm.v1.DM/DmView','Kt',{activityMeta:[bytes]},out=>assert.equal(out.activityMeta.length,0)],
];
for(const [path,name,input,verify] of fixtureCases) {
  const type=codec(name),data=Buffer.concat([type.toBinary(type.create(input)),unknown]);
  for(const compressed of [false,true]) {
    const out=await run(path,frame(data,compressed),compressed?{'grpc-encoding':'gzip'}:{});
    assert(out.body instanceof Uint8Array);assert(Buffer.from(out.body).includes(unknown));verify(type.fromBinary(out.body.subarray(5)));
  }
}
const chronos=JSON.parse(read('modules/chronos.manifest.json'));
for(const [path,name] of [['app.view.v1.View/ViewProgress','pt'],['app.viewunite.v1.View/ViewProgress','Mt']]) {
  const type=codec(name),data=type.toBinary(type.create({chronos:{md5:'45b564f5ba1fdd3746406937059addd8',file:'https://original.example/official.zip',sign:'signature'}}));
  const output=await run(path,frame(data));const updated=type.fromBinary(output.body.subarray(5)).chronos;
  assert.equal(updated.md5,chronos.md5);assert.equal(updated.file,chronos.url);assert.equal(updated.sign,undefined);
}
for(const [path,name] of [['app.playurl.v1.PlayURL/PlayView','He'],['app.playerunite.v1.Player/PlayViewUnite','$e'],['pgc.gateway.player.v2.PlayURL/PlayView','pn']]) {
  const type=codec(name),data=Buffer.concat([type.toBinary(type.create()),unknown]);
  const output=await run(path,frame(data));assert(Buffer.from(output.body).includes(unknown));
}
for(const body of [new Uint8Array([0,0]),new Uint8Array(10),frame(new Uint8Array([0xff]))])assert.equal(Object.keys(await run('app.viewunite.v1.View/View',body)).length,0);
assert.equal(Object.keys(await run('app.viewunite.v1.View/View',frame(new Uint8Array()),{'grpc-status':'7'})).length,0);
console.log('PASS full compatibility: frozen baselines, four hosts without grpc, 15 exact app response routes, no replay/nested/DM segment hooks, native/provider/asset hashes, banner/comment/gzip fixtures and app-host Chronos chain');
