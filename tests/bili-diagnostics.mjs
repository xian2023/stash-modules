import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import YAML from 'yaml';
const read=path=>fs.readFileSync(path,'utf8');
const main=YAML.parse(read('modules/Bilibili_remove_ads.stoverride'));
const manifest=JSON.parse(read('modules/Bilibili_diagnostics.manifest.json'));
const stages=manifest.stages.map(s=>YAML.parse(read(s.module)));
const matches=(pattern,url)=>new RegExp(pattern.replace(/^\(\?i\)/,''),'i').test(url);
const hooks=(config,url,type)=>(config.http.script||[]).filter(h=>(!type||h.type===type)&&matches(h.match,url));
assert.equal(manifest.exclusive,true);assert.equal(manifest.sourceVersion,main.version);
assert.equal(manifest.sourceSha256,crypto.createHash('sha256').update(read('modules/Bilibili_remove_ads.stoverride')).digest('hex'));
assert.equal(stages.length,4);
for(let i=0;i<stages.length;i++) {
  const config=stages[i],definition=manifest.stages[i];
  assert.equal(crypto.createHash('sha256').update(read(definition.module)).digest('hex'),definition.sha256);
  assert(!read(definition.module).includes('#!replace'));
  assert.deepEqual(config.http.mitm,main.http.mitm);
  for(const h of config.http.script||[]) {assert(config['script-providers'][h.name]);if(h.argument)assert.equal(JSON.parse(h.argument).sponsorBlock,false);}
  assert.deepEqual(Object.keys(config['script-providers']||{}).sort(),[...new Set((config.http.script||[]).map(h=>h.name))].sort());
  assert.equal(hooks(config,'https://api.bilibili.com/x/stash-airborne/segments?aid=170001&cid=111111').length,0);
  for(const host of ['grpc.biliapi.net','app.bilibili.com']) {
    for(const family of ['view','viewunite'])assert.equal(hooks(config,`https://${host}/bilibili.app.${family}.v1.View/ViewProgress`).length,0);
    assert.equal(hooks(config,`https://${host}/bilibili.community.service.dm.v1.DM/DmSegMobile`).length,0);
    for(const route of ['app.viewunite.v1.View/View','main.community.reply.v1.Reply/MainList','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList']) {
      assert.equal(hooks(config,`https://${host}/bilibili.${route}`,'request').length,i===0?1:0);
    }
  }
}
for(const config of stages.slice(0,3)) {
  assert.deepEqual(config.rules,main.rules);
  for(const field of ['body-rewrite','url-rewrite','mock'])assert.deepEqual(config.http[field],main.http[field]);
}
assert.equal(stages[0].http.script.length,3);
assert.equal(stages[1].http.script.length,2);
assert(stages[1].http.script.every(h=>h.type==='response'));
for(const host of ['grpc.biliapi.net','app.bilibili.com']) {
  for(const path of ['main.community.reply.v1.Reply/MainList','app.viewunite.v1.View/View','community.service.dm.v1.DM/DmView'])assert.equal(hooks(stages[1],`https://${host}/bilibili.${path}`,'response').length,1);
}
assert.equal(stages[2].http.script.length,0);assert.equal(stages[2]['script-providers'],undefined);
assert.deepEqual(stages[3].http,{mitm:main.http.mitm});
assert.deepEqual(Object.keys(stages[3]).sort(),['name','desc','version','category','homepage','http'].sort());
assert.equal(manifest.hostProbes.length,5);
const probeHosts=[];
for(const definition of manifest.hostProbes) {
  const text=read(definition.module),config=YAML.parse(text);
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),definition.sha256);
  assert.equal(config.version,manifest.version);
  assert(!text.includes('#!replace'));
  assert.deepEqual(Object.keys(config).sort(),Object.keys(stages[3]).sort());
  assert.deepEqual(Object.keys(config.http),['mitm']);
  assert.equal(config.http.mitm.length,1);
  probeHosts.push(config.http.mitm[0]);
  assert.equal(definition.url,`https://raw.githubusercontent.com/xian2023/stash-modules/main/${definition.module}`);
}
assert.deepEqual(probeHosts,main.http.mitm);
console.log('PASS Bili diagnostics: source/file hashes, exact stage boundaries, both hosts, no airborne/ViewProgress/DM interception, provider pruning, preserved native rules and MitM-only isolation');
console.log('PASS single-host diagnostics: five separate exclusive MitM-only files, complete hostname coverage, hashes and remote URLs');
