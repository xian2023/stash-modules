import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import crypto from 'node:crypto';
const read = p => fs.readFileSync(p,'utf8');
const module = YAML.parse(read('output/Bilibili_remove_ads.stoverride'));
const baseURL = 'https://grpc.biliapi.net/bilibili.';
const tests = [];
function test(name, fn) { tests.push([name,fn]); }
function frame(data, compressed=false) {
  if (compressed) data=gzipSync(data);
  const out=new Uint8Array(data.length+5);
  new DataView(out.buffer).setUint32(1,data.length,false); out[0]=compressed?1:0; out.set(data,5); return out;
}
const globals = {Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,console, setTimeout, clearTimeout};
function codecs(file, symbols) {
  const ctx=vm.createContext({...globals,$request:null});
  vm.runInContext(read(file).replace(/(?:nt|mn)\.run\(\);\s*$/, ''),ctx);
  return Object.fromEntries(symbols.map(s=>[s,vm.runInContext(s,ctx)]));
}
const req=codecs('output/scripts/bilibili.request.stash.js',['St','_e','le','Ce','stashResponse']);
const res=codecs('output/scripts/bilibili.response.stash.js',['pt','Mt','tn','Lt','Kt','yn','Ee']);
function requestBody({pid='170001',oid='111111',type=1,segmentIndex='1',compressed=false}={}) {
  return frame(req.St.toBinary(req.St.create({pid,oid,type,segmentIndex})),compressed);
}
async function run(kind, {url,method='POST',body,headers,response,argument,store=new Map(),network}={}) {
  const source=read(`output/scripts/bilibili.${kind}.stash.js`);
  const calls=[]; const logs=[];
  let doneCount=0; let resolveDone;
  const done=new Promise(resolve=>resolveDone=resolve);
  const ctx={...globals,console:{log:(...args)=>logs.push(args.join(' '))},
    $request:{url:url?.startsWith('https://')?url:baseURL+(url||'community.service.dm.v1.DM/DmSegMobile'),method,headers:headers??{'content-type':'application/grpc','x-bili-moss-engine-type':'1'},body:body??requestBody()},
    $argument:JSON.stringify(argument??{displayUpList:'show',purifyComment:true,sponsorBlock:true,logLevel:'off'}),
    $persistentStore:{read:k=>store.get(k)??null,write:(v,k)=>(store.set(k,v),true)},
    $httpClient:{},$notification:{post(){}},$done:value=>{doneCount++;resolveDone(value);}
  };
  if(response)ctx.$response=response;
  for (const method of ['get','post']) ctx.$httpClient[method]=(options,callback)=>{
    calls.push({method,...options});
    const result=network?.(options,method,calls);
    if(result?.hang)return;
    Promise.resolve(result).then(r=>callback(r?.error??null,r?.response??{status:200,headers:{'content-type':'application/grpc'}},r?.data??'[]'));
  };
  vm.runInNewContext(source,ctx,{timeout:1500});
  let deadline;
  const output=await Promise.race([done,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('No $done')),7000)})]).finally(()=>clearTimeout(deadline));
  await Promise.resolve();
  assert.equal(doneCount,1,'exactly one $done');
  return {output,calls,logs,store,doneCalls:()=>doneCount};
}
const segments=JSON.stringify([{actionType:'skip',segment:[10,30]}]);
const successNetwork=(o,m)=>m==='get'?{data:segments,response:{status:200,headers:{}}}:{data:frame(req._e.toBinary(req._e.create({elems:[]}))),response:{status:200,headers:{'content-type':'application/grpc','grpc-status':'0'}}};

test('Module YAML, unique script names, body limits, no old provider dependencies',()=>{
  assert.equal(module.http.script.length,5);
  for(const hook of module.http.script) {
    assert(module['script-providers'][hook.name]); assert(hook['max-size']>0); assert(hook.timeout<=10);
    new RegExp(hook.match.replace(/^\(\?i\)/,''));
  }
  assert(!read('output/Bilibili_remove_ads.stoverride').includes('gitlab.com'));
  for(const value of Object.values(module['script-providers'])) new vm.Script(value.payload);
});
test('Passthrough comparison module never intercepts comment requests or responses',()=>{
  const remote=YAML.parse(read('modules/Bilibili_passthrough.stoverride'));
  for(const config of [remote]) for(const host of ['grpc.biliapi.net','app.bilibili.com']) for(const method of ['MainList','DetailList','DialogList']) {
    const url=`https://${host}/bilibili.main.community.reply.v1.Reply/${method}`;
    assert.equal(config.http.script.filter(h=>new RegExp(h.match.replace(/^\(\?i\)/,'')).test(url)).length,0);
    assert.equal(config.http.mock.filter(h=>new RegExp(h.match.replace(/^\(\?i\)/,'')).test(url)).length,0);
  }
});
test('Main module covers View/MainList and nested DetailList/DialogList request relay',()=>{
  const remote=YAML.parse(read('modules/Bilibili_remove_ads.stoverride'));
  for(const config of [module,remote]) {
    for(const path of ['main.community.reply.v1.Reply/MainList','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList','app.viewunite.v1.View/View']) {
      const hooks=config.http.script.filter(h=>h.type==='request'&&new RegExp(h.match.replace(/^\(\?i\)/,'')).test(baseURL+path));
      assert.equal(hooks.length,1);assert.equal(hooks[0].timeout,10);assert.equal(JSON.parse(hooks[0].argument).optimizeRequest,true);
    }
    for(const path of ['main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList']) {
      assert.equal(config.http.script.filter(h=>h.type==='response'&&new RegExp(h.match.replace(/^\(\?i\)/,'')).test(baseURL+path)).length,0);
    }
    for(const method of ['Like','Add','Delete','PreviewList','ReplyInfo']) assert.equal(config.http.script.filter(h=>new RegExp(h.match.replace(/^\(\?i\)/,'')).test(baseURL+'main.community.reply.v1.Reply/'+method)).length,0);
  }
});
test('Remote providers have versioned URLs and exact manifest hashes, no payload',()=>{
  const config=YAML.parse(read('modules/Bilibili_remove_ads.stoverride'));
  const manifest=JSON.parse(read('modules/manifest.json'));
  assert(Buffer.byteLength(read('modules/Bilibili_remove_ads.stoverride'))<20000);
  for(const [name,provider] of Object.entries(config['script-providers'])) {
    assert(name.endsWith(manifest.release));assert.equal(provider.payload,undefined);assert.equal(provider.path,undefined);
    const url=new URL(provider.url);assert.equal(url.host,'raw.githubusercontent.com');
    const file=url.pathname.split('/').slice(4).join('/');
    assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex'),manifest.scripts[provider.url]);
    new vm.Script(read(file));
  }
  assert(config.http.script.every(h=>config['script-providers'][h.name]));
});
test('Optional comment module only intercepts MainList responses and shares provider',()=>{
  const main=YAML.parse(read('modules/Bilibili_remove_ads.stoverride'));
  const optional=YAML.parse(read('modules/Bilibili_comments_optional.stoverride'));
  const [hook]=optional.http.script;assert.equal(optional.http.script.length,1);assert.equal(hook.type,'response');assert.equal(hook.timeout,1);
  assert(new RegExp(hook.match).test(baseURL+'main.community.reply.v1.Reply/MainList'));
  assert(!new RegExp(hook.match).test(baseURL+'app.view.v1.View/ViewProgress'));
  assert.deepEqual(optional['script-providers'][hook.name],main['script-providers'][hook.name]);
});
test('All native jq programs compile and execute',()=>{
  for(const rule of module.http['body-rewrite']) {
    const expr=rule.split(' response-jq ')[1]; assert(expr);
    const r=spawnSync('jq',[expr],{input:JSON.stringify({code:0,data:{modules:[],items:[],domains:[],tab:[],sections_v2:[]}}),encoding:'utf8'});
    assert.equal(r.status,0,r.stderr+'\n'+expr);
  }
});
test('Native feed/story filtering preserves video and removes ads',()=>{
  const cases=[['https://app.bilibili.com/x/v2/feed/index?test=1',{items:[{card_goto:'av',card_type:'small_cover_v2'},{card_goto:'av',card_type:'small_cover_v2',ad_info:{}},{banner_item:{}}]},1],['https://app.bilibili.com/x/v2/feed/index/story?test=1', {items:[{card_goto:'av',story_cart_icon:{}},{card_goto:'vertical_ad_av'},{ad_info:{}}]},1]];
  for(const [key,data,size] of cases) {
    const rule=module.http['body-rewrite'].find(r=>new RegExp(r.split(' response-jq ')[0].replace(/^\(\?i\)/,'')).test(key));assert(rule,key);
    const r=spawnSync('jq',[rule.split(' response-jq ')[1]],{input:JSON.stringify({data}),encoding:'utf8'});
    assert.equal(r.status,0,r.stderr); const out=JSON.parse(r.stdout);assert.equal(out.data.items.length,size);assert.equal(out.data.items[0].story_cart_icon,undefined);
  }
});
test('Static gRPC mocks have valid frame lengths and grpc-status=0',()=>{
  for(const mock of module.http.mock.filter(m=>m.base64)) {
    const data=Buffer.from(mock.base64,'base64');assert.equal(data.readUInt32BE(1),data.length-5);assert.equal(mock.headers['grpc-status'],'0');
  }
});
const dmHeader='x-stash-bili-airborne-context';
const dmIdentity='1:170001:111111:1';
const dmReply=()=>frame(req._e.toBinary(req._e.create({elems:[{id:'987',content:'ordinary danmaku',progress:1000}]})));
const dmStore=(segments=[[10,30]],cid='111111')=>new Map([['bili.stash.sponsor.v1',JSON.stringify({entries:{[req.le('170001')+':'+cid]:{until:Date.now()+60000,segments}}})]]);
const dmResponse=(options={})=>run('request',{
  headers:{'content-type':'application/grpc','x-bili-moss-engine-type':'1',[dmHeader]:dmIdentity},
  response:{status:200,headers:{'content-type':'application/grpc','grpc-status':'0'},body:dmReply()},...options
});
test('DM hooks split synchronous request identity from response enrichment; no overlapping response filter',()=>{
  for(const file of ['modules/Bilibili_remove_ads.stoverride','modules/Bilibili_passthrough.stoverride']) {
    const config=YAML.parse(read(file));
    const hooks=config.http.script.filter(h=>new RegExp(h.match.replace(/^\(\?i\)/,'')).test(baseURL+'community.service.dm.v1.DM/DmSegMobile'));
    assert.deepEqual(hooks.map(h=>h.type),['request','response']);
    assert.equal(hooks[0].timeout,1);assert.equal(hooks[1].timeout,2);assert.equal(hooks[0].name,hooks[1].name);
  }
});
test('Cold DM request returns headers synchronously, preserving body/account headers and making no network calls',async()=>{
  const body=requestBody();const headers={'content-type':'application/grpc','Cookie':'keep','Authorization':'keep','X-Stash-Bili-Airborne-Context':'forged'};
  const start=performance.now();const r=await run('request',{body,headers,network:()=>({hang:true})});
  assert(performance.now()-start<250);assert.equal(r.calls.length,0);assert.equal(r.output.headers[dmHeader],dmIdentity);
  assert.equal(r.output.headers.Cookie,'keep');assert.equal(r.output.headers.Authorization,'keep');assert.equal(r.output.headers['X-Stash-Bili-Airborne-Context'],undefined);
  assert.equal(r.output.body,undefined);assert.equal(r.output.response,undefined);assert.equal(r.output.url,undefined);
  const response=await dmResponse({headers:r.output.headers,network:successNetwork});assert(response.output.body);
});
test('No service data preserves exact original DM response without official replay',async()=>{
  const r=await dmResponse();assert.equal(Object.keys(r.output).length,0);assert.equal(r.calls.length,1);assert.equal(r.calls[0].method,'get');assert.equal(r.calls[0].timeout,0.2);assert.equal(r.calls[0]['auto-cookie'],false);
});
test('Response positive hit appends exact chronos marker while retaining ordinary danmaku and unknown fields',async()=>{
  const unknown=Buffer.from([0xa0,0x06,0x7b]);
  const data=Buffer.concat([req._e.toBinary(req._e.create({elems:[{id:'987',content:'ordinary danmaku'}]})),unknown]);
  const r=await dmResponse({network:successNetwork,response:{status:200,headers:{'grpc-status':'0'},body:frame(data)}});
  assert.equal(r.calls.length,1);assert.equal(r.calls[0].method,'get');assert.equal(r.output.headers['grpc-status'],'0');
  const out=req._e.fromBinary(r.output.body.subarray(5));assert.equal(out.elems[0].content,'ordinary danmaku');
  assert.equal(out.elems[1].content,'空指部已就位');assert.equal(out.elems[1].action,'airborne:30000');assert.equal(out.elems[1].progress,12000);assert(Buffer.from(r.output.body).includes(unknown));
});
test('Positive BV+CID cache avoids all response network calls; another CID does not reuse segments',async()=>{
  const store=new Map();await dmResponse({store,network:successNetwork});
  const r=await dmResponse({store,network:()=>{throw Error('No cache-hit network');}});assert.equal(r.calls.length,0);assert(r.output.body);
  const other=await dmResponse({store,headers:{[dmHeader]:'1:170001:222222:1'}});assert.equal(other.calls.length,1);assert.equal(Object.keys(other.output).length,0);
});
test('Negative cache, error circuit and 404 handling still avoid repeated lookup waits',async()=>{
  const store=new Map();await dmResponse({store});const r=await dmResponse({store});assert.equal(r.calls.length,0);assert.equal(Object.keys(r.output).length,0);
  const offline=new Map();await dmResponse({store:offline,network:()=>({error:'offline'})});
  const stopped=await dmResponse({store:offline,headers:{[dmHeader]:'1:170002:111111:1'}});assert.equal(stopped.calls.length,0);
  const missing=new Map();await dmResponse({store:missing,network:()=>({response:{status:404,headers:{}}})});
  const next=await dmResponse({store:missing,headers:{[dmHeader]:'1:170002:111111:1'}});assert.equal(next.calls.length,1);
});
test('Hung lookup releases DM response within 700ms; late callback cannot write cache or call done twice',async()=>{
  const store=new Map();let finishNetwork;
  const late=new Promise(resolve=>finishNetwork=resolve);
  const start=performance.now();const r=await dmResponse({store,network:()=>late});assert(performance.now()-start<700);assert.equal(Object.keys(r.output).length,0);
  const before=store.get('bili.stash.sponsor.v1');finishNetwork({data:segments,response:{status:200,headers:{}}});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(store.get('bili.stash.sponsor.v1'),before);assert.equal(r.doneCalls(),1);
});
test('Concurrent DM response skips active service lease and comments complete while lookup hangs',async()=>{
  const store=new Map();const pending=dmResponse({store,network:()=>({hang:true})});
  const second=await dmResponse({store});assert.equal(second.calls.length,0);assert.equal(Object.keys(second.output).length,0);
  const start=performance.now();const comment=await run('request',{url:'main.community.reply.v1.Reply/DetailList',store,network:()=>({data:frame(new Uint8Array()),response:{status:200,headers:{'grpc-status':'0'}}})});
  assert(performance.now()-start<200);assert(comment.output.response);assert.equal(comment.calls.length,1);await pending;
});
test('Expired leases cannot block new lookups; newer positive cache survives older lookup failure',async()=>{
  const store=new Map([['bili.stash.sponsor.v1',JSON.stringify({pending:{key:'old',token:'old',until:1}})]]);
  const r=await dmResponse({store,network:successNetwork});assert.equal(r.calls.length,1);assert(r.output.body);
  const concurrent=new Map();let resolveNetwork;const waiting=dmResponse({store:concurrent,network:()=>new Promise(resolve=>resolveNetwork=resolve)});
  concurrent.set('bili.stash.sponsor.v1',dmStore().get('bili.stash.sponsor.v1'));resolveNetwork({error:'late failure'});
  const result=await waiting;assert(result.output.body);assert.deepEqual(JSON.parse(concurrent.get('bili.stash.sponsor.v1')).entries[req.le('170001')+':111111'].segments,[[10,30]]);
});
test('Malformed service data and invalid segment ranges preserve original response',async()=>{
  for(const data of ['<html>error</html>','{}',JSON.stringify([{actionType:'skip',segment:[30,10]},{actionType:'skip',segment:[-10,30]},{actionType:'skip',segment:[1,4]},{actionType:'skip',segment:['10',30]}])]) {
    const r=await dmResponse({network:()=>({data,response:{status:200,headers:{}}})});assert.equal(Object.keys(r.output).length,0);assert.equal(r.calls.length,1);
  }
});
test('Expired/corrupt cache cannot supply an invalid airborne marker',async()=>{
  for(const value of ['bad JSON',JSON.stringify({entries:{[req.le('170001')+':111111']:{until:1,segments:[[10,30]]}}}),JSON.stringify({entries:{bad:null}}),JSON.stringify({entries:{[req.le('170001')+':111111']:{until:Date.now()+60000,segments:['wrong']}}})]) {
    const r=await dmResponse({store:new Map([['bili.stash.sponsor.v1',value]])});assert.equal(r.calls.length,1);assert.equal(Object.keys(r.output).length,0);
  }
});
test('Gzip request tag and gzip original DM response work without extra Bilibili requests',async()=>{
  const tagged=await run('request',{body:requestBody({compressed:true})});assert.equal(tagged.calls.length,0);assert.equal(tagged.output.headers[dmHeader],dmIdentity);
  const r=await dmResponse({headers:tagged.output.headers,network:successNetwork,response:{status:200,headers:{'grpc-encoding':'gzip','content-length':'999'},body:frame(req._e.toBinary(req._e.create()),true)}});
  assert.equal(r.calls.length,1);assert.equal(r.output.body[0],0);assert.equal(r.output.headers['grpc-encoding'],'identity');assert.equal(r.output.headers['content-length'],undefined);
});
test('Unsupported request and disabled mode never call a service and remove preexisting internal header',async()=>{
  const options=[{body:new Uint8Array([0,0])},{body:frame(new Uint8Array([0]))},{body:new Uint8Array(10)},{body:requestBody({type:2})},{body:requestBody({oid:'0'})},{argument:{sponsorBlock:false}},{argument:{sponsorBlock:'#'}}];
  for(const option of options) {
    const r=await run('request',option);assert.equal(r.calls.length,0);assert.equal(Object.keys(r.output).length,0);
    const clean=await run('request',{...option,headers:{[dmHeader]:'forged',Cookie:'keep'}});assert.equal(clean.output.headers[dmHeader],undefined);assert.equal(clean.output.headers.Cookie,'keep');
  }
});
test('Missing or malformed correlation and disabled response phase pass through without lookup',async()=>{
  for(const value of [undefined,'1:1:2','1:1:2:0','1:01:2:1','1:-1:2:1','2:1:2:1','1:1:2:5967','1:9223372036854775808:2:1','1:1:2:1:extra']) {
    const r=await dmResponse({headers:value?{[dmHeader]:value}:{}});assert.equal(r.calls.length,0);assert.equal(Object.keys(r.output).length,0);
  }
  const disabled=await dmResponse({argument:{sponsorBlock:false}});assert.equal(disabled.calls.length,0);assert.equal(Object.keys(disabled.output).length,0);
});
test('HTTP/gRPC errors, malformed and multi-frame DM responses remain unchanged without service lookup',async()=>{
  for(const response of [{status:500,body:dmReply()},{status:200,headers:{'Grpc-Status':'7'},body:dmReply()},{status:200,headers:{},h2_trailers:{'Grpc-Status':'7'},body:dmReply()},{status:200,headers:{},body:new Uint8Array(10)}]) {
    const r=await dmResponse({response});assert.equal(r.calls.length,0);assert.equal(Object.keys(r.output).length,0);
  }
  const bad=await dmResponse({store:dmStore(),response:{status:200,headers:{},body:frame(new Uint8Array([0]))}});assert.equal(Object.keys(bad.output).length,0);assert.equal(bad.calls.length,0);
});
test('Markers use actual progress for segment boundaries; irrelevant segments preserve exact bytes',async()=>{
  const store=dmStore([[357.999,380],[358,390]]);
  const first=await dmResponse({store});const a=req._e.fromBinary(first.output.body.subarray(5));assert.deepEqual(Array.from(a.elems.filter(e=>e.action),e=>e.progress),[359999]);
  const second=await dmResponse({store,headers:{[dmHeader]:'1:170001:111111:2'}});const b=req._e.fromBinary(second.output.body.subarray(5));assert.deepEqual(Array.from(b.elems.filter(e=>e.action),e=>e.progress),[360000]);
  const third=await dmResponse({store,headers:{[dmHeader]:'1:170001:111111:3'}});assert.equal(Object.keys(third.output).length,0);assert.equal(third.calls.length,0);
});
test('Response reinvocation does not append duplicate airborne actions',async()=>{
  const store=dmStore();const first=await dmResponse({store});const second=await dmResponse({store,response:first.output});assert.equal(second.calls.length,0);assert.equal(Object.keys(second.output).length,0);
});
test('ViewProgress enables chronos; disabled boolean preserves official file',async()=>{
  for(const sponsorBlock of [true,false]) {
    const msg=res.pt.create({chronos:{md5:'45b564f5ba1fdd3746406937059addd8',file:'https://original.example/official.zip',sign:'signature'}});
    const r=await run('response',{url:'app.view.v1.View/ViewProgress',response:{status:200,headers:{'content-type':'application/grpc'},body:frame(res.pt.toBinary(msg))},argument:{sponsorBlock,logLevel:'off'}});
    const out=res.pt.fromBinary(r.output.body.subarray(5));
    assert.equal(out.chronos.file,sponsorBlock?'https://raw.githubusercontent.com/kokoryh/chronos/refs/heads/master/e5a968f1a5055bbe5c12e67b100a6dcb.zip':'https://original.example/official.zip');
  }
});
test('Viewunite ViewProgress also enables chronos',async()=>{
  const msg=res.Mt.create({chronos:{md5:'45b564f5ba1fdd3746406937059addd8',file:'original'}});
  const r=await run('response',{url:'app.viewunite.v1.View/ViewProgress',response:{status:200,headers:{},body:frame(res.Mt.toBinary(msg))}});
  assert(res.Mt.fromBinary(r.output.body.subarray(5)).chronos.file.includes('kokoryh/chronos'));
});
test('Compressed protobuf response is decoded and re-framed with explicit status',async()=>{
  const r=await run('response',{url:'community.service.dm.v1.DM/DmView',response:{status:200,headers:{'grpc-encoding':'gzip','content-length':'999'},body:frame(res.Kt.toBinary(res.Kt.create({activityMeta:[new Uint8Array([1])]})),true)}});
  assert.equal(r.output.status,200);assert.equal(r.output.body[0],0);assert.equal(r.output.headers['grpc-encoding'],'identity');assert.equal(res.Kt.fromBinary(r.output.body.subarray(5)).activityMeta.length,0);
});
test('Unknown protobuf wire fields survive response rewriting',async()=>{
  const unknown=Buffer.from([0xa0,0x06,0x7b]); // field 100 = 123
  const data=Buffer.concat([res.Kt.toBinary(res.Kt.create()),unknown]);
  const r=await run('response',{url:'community.service.dm.v1.DM/DmView',response:{status:200,headers:{},body:frame(data)}});
  assert(Buffer.from(r.output.body).includes(unknown));
});
test('Non-success grpc-status and malformed response fail open',async()=>{
  for(const response of [{status:200,headers:{'grpc-status':'7'},body:frame(new Uint8Array())},{status:200,headers:{'grpc-status':'0'},h2_trailers:{'Grpc-Status':'7'},body:frame(new Uint8Array())},{status:200,headers:{},body:new Uint8Array([0,0])},{status:200,headers:{},body:new Uint8Array(10)}]) {
    const r=await run('response',{url:'community.service.dm.v1.DM/DmView',response});assert.equal(Object.keys(r.output).length,0);
  }
});
test('gRPC status capitalization is normalized without duplicate headers',async()=>{
  const r=await run('response',{url:'community.service.dm.v1.DM/DmView',response:{status:200,headers:{'Grpc-Status':'0'},body:frame(res.Kt.toBinary(res.Kt.create()))}});
  assert.equal(r.output.headers['grpc-status'],'0');assert.equal(Object.keys(r.output.headers).filter(k=>k.toLowerCase()==='grpc-status').length,1);
});
test('Selected live JSON route removes promotions without external requests',async()=>{
  const r=await run('live',{url:'https://api.live.bilibili.com/xlive/app-room/v1/index/getInfoByUser?room_id=1',method:'GET',response:{status:200,headers:{},body:JSON.stringify({code:0,data:{play_together_info:{ad:1},play_together_info_v2:{ad:2},function_card:{ad:{}}}})}});
  const out=JSON.parse(r.output.body);assert.equal(out.data.play_together_info,undefined);assert.equal(out.data.function_card.ad,null);assert.equal(r.calls.length,0);
});
test('Comment protobuf ads removed while unknown comments are retained',async()=>{
  const data=res.tn.create({cm:new Uint8Array([1]),mixedCards:[new Uint8Array([2])],topReplies:[],subjectTopCards:[]});
  const r=await run('response',{url:'main.community.reply.v1.Reply/MainList',response:{status:200,headers:{},body:frame(res.tn.toBinary(data))}});
  const out=res.tn.fromBinary(r.output.body.subarray(5));assert.equal(out.cm,undefined);assert.equal(out.mixedCards.length,0);
});

const commentMessage=()=>res.tn.toBinary(res.tn.create({cm:new Uint8Array([1]),mixedCards:[new Uint8Array([2])],topReplies:[],subjectTopCards:[]}));
test('Loon MainList request relay preserves request bytes, filters ads and never queries SponsorBlock',async()=>{
  const body=new Uint8Array([0,1,2,3]);
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',body,network:()=>({data:frame(commentMessage()),response:{status:200,headers:{'content-type':'application/grpc'}}})});
  assert.equal(r.calls.length,1);assert.equal(r.calls[0].method,'post');assert.equal(r.calls[0].url,baseURL+'main.community.reply.v1.Reply/MainList');
  assert.equal(r.calls[0].timeout,3);assert.equal(r.calls[0]['binary-mode'],true);assert.equal(r.calls[0].body,body);
  assert.equal(r.output.response.status,200);assert.equal(r.output.response.headers['grpc-status'],'0');
  const out=res.tn.fromBinary(r.output.response.body.subarray(5));assert.equal(out.cm,undefined);assert.equal(out.mixedCards.length,0);
});
test('Loon MainList relay retries app.bilibili.com after grpc host failure',async()=>{
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',network:(o,m,calls)=>calls.length===1?{error:'grpc host failed'}:{data:frame(commentMessage()),response:{status:200,headers:{}}}});
  assert.equal(r.calls.length,2);assert(r.calls[0].url.startsWith('https://grpc.biliapi.net/'));assert(r.calls[1].url.startsWith('https://app.bilibili.com/'));
  assert(r.calls.every(c=>c.timeout===3));assert(r.output.response);
});
test('Loon MainList relay fails open after both hosts fail',async()=>{
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',network:()=>({error:'offline'})});
  assert.equal(r.calls.length,2);assert.equal(Object.keys(r.output).length,0);
});
test('Loon relay starting on app host does not retry the earlier grpc host',async()=>{
  const r=await run('request',{url:'https://app.bilibili.com/bilibili.main.community.reply.v1.Reply/MainList',network:()=>({error:'offline'})});
  assert.equal(r.calls.length,1);assert(r.calls[0].url.startsWith('https://app.bilibili.com/'));assert.equal(Object.keys(r.output).length,0);
});
test('Loon optimizeRequest false prevents relay and added requests',async()=>{
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',argument:{optimizeRequest:false,logLevel:'off'}});
  assert.equal(r.calls.length,0);assert.equal(Object.keys(r.output).length,0);
});
test('Loon Viewunite request relay preserves the upstream purification path',async()=>{
  const data=req.Ce.toBinary(req.Ce.create({cm:new Uint8Array([1])}));
  const r=await run('request',{url:'app.viewunite.v1.View/View',network:()=>({data:frame(data),response:{status:200,headers:{}}})});
  assert.equal(r.calls.length,1);assert(r.output.response);assert.equal(req.Ce.fromBinary(r.output.response.body.subarray(5)).cm,undefined);
});
test('Loon engine type status workaround handles mixed-case request header',async()=>{
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',headers:{'X-Bili-Moss-Engine-Type':'1'},network:()=>({data:frame(commentMessage()),response:{status:200,headers:{}}})});
  assert.equal(r.output.response.headers['grpc-status'],'0');
});
test('gRPC trailer metadata is promoted with errors preserved',()=>{
  const out=req.stashResponse({status:200,headers:{'Grpc-Status':'0','Grpc-Message':'old'},h2_trailers:{'Grpc-Status':'7','grpc-message':'permission denied','grpc-status-details-bin':'AA=='},body:frame(new Uint8Array())});
  assert.equal(out.headers['grpc-status'],'7');assert.equal(out.headers['grpc-message'],'permission denied');assert.equal(out.headers['grpc-status-details-bin'],'AA==');assert.equal(out.headers['Grpc-Status'],undefined);
});
test('Loon relay compressed comments retain unknown wire fields',async()=>{
  const unknown=Buffer.from([0xa0,0x06,0x7b]);
  const r=await run('request',{url:'main.community.reply.v1.Reply/MainList',network:()=>({data:frame(Buffer.concat([commentMessage(),unknown]),true),response:{status:200,headers:{'grpc-encoding':'gzip'},h2_trailers:{'grpc-status':'0'}}})});
  assert.equal(r.output.response.body[0],0);assert.equal(r.output.response.headers['grpc-status'],'0');assert(Buffer.from(r.output.response.body).includes(unknown));
});

for(const rpc of ['DetailList','DialogList']) {
  const path='main.community.reply.v1.Reply/'+rpc;
  test(`${rpc} relay preserves opaque request and nested reply body bytes`,async()=>{
    // Include wire fields 11 and 27 that MainList filtering would remove.
    const body=new Uint8Array([0,0,0,0,2,8,1]);
    const reply=frame(new Uint8Array([0x5a,2,8,1,0xda,1,2,8,2]));
    const r=await run('request',{url:path,body,network:()=>({data:reply,response:{status:200,headers:{'content-type':'application/grpc'}}})});
    assert.equal(r.calls.length,1);assert.equal(r.calls[0].method,'post');assert.equal(r.calls[0].body,body);assert.equal(r.calls[0].timeout,3);assert.equal(r.calls[0]['binary-mode'],true);
    assert.equal(r.output.response.body,reply);assert.equal(r.output.response.headers['grpc-status'],'0');assert.equal(r.output.response.status,200);
  });
  test(`${rpc} gzip frame is not decompressed or re-encoded`,async()=>{
    const reply=frame(new Uint8Array([0x5a,2,8,1,0xda,1,2,8,2]),true);
    const r=await run('request',{url:path,network:()=>({data:reply,response:{status:200,headers:{'grpc-encoding':'gzip'},h2_trailers:{'grpc-status':'0'}}})});
    assert.equal(r.output.response.body,reply);assert.equal(r.output.response.body[0],1);assert.equal(r.output.response.headers['grpc-encoding'],'gzip');
  });
  test(`${rpc} grpc host failure retries app host with body preserved`,async()=>{
    const reply=frame(new Uint8Array([8,123]));
    const r=await run('request',{url:path,network:(o,m,calls)=>calls.length===1?{error:'first host failed'}:{data:reply,response:{status:200,headers:{}}}});
    assert.equal(r.calls.length,2);assert(r.calls[0].url.startsWith('https://grpc.biliapi.net/'));assert(r.calls[1].url.startsWith('https://app.bilibili.com/'));assert.equal(r.output.response.body,reply);
  });
  test(`${rpc} relay preserves visible gRPC error instead of converting it to success`,async()=>{
    const reply=frame(new Uint8Array());
    const r=await run('request',{url:path,network:()=>({data:reply,response:{status:200,headers:{'Grpc-Status':'0'},h2_trailers:{'Grpc-Status':'7','Grpc-Message':'permission denied'}}})});
    assert.equal(r.calls.length,1);assert.equal(r.output.response.headers['grpc-status'],'7');assert.equal(r.output.response.headers['grpc-message'],'permission denied');assert.equal(r.output.response.body,reply);
  });
  test(`${rpc} relay fails open when both hosts fail or optimizeRequest is false`,async()=>{
    const r=await run('request',{url:path,network:()=>({error:'offline'})});assert.equal(r.calls.length,2);assert.equal(Object.keys(r.output).length,0);
    const disabled=await run('request',{url:path,argument:{optimizeRequest:false,logLevel:'off'}});assert.equal(disabled.calls.length,0);assert.equal(Object.keys(disabled.output).length,0);
  });
}

let passed=0;const results=[];
for(const [name,fn]of tests){try{await fn();passed++;console.log('PASS',name);results.push({name,passed:true});}catch(error){console.error('FAIL',name,error);results.push({name,passed:false,error:String(error)});}}
fs.writeFileSync('evidence/test-results.json',JSON.stringify({passed,total:tests.length,scope:'Node VM + jq, synthetic fixtures; no Stash/iPhone runtime',results},null,2));
console.log(`${passed}/${tests.length} passed`);if(passed!==tests.length)process.exitCode=1;
