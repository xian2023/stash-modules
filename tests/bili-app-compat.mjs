import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import YAML from 'yaml';

const read=p=>fs.readFileSync(p,'utf8');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const manifest=JSON.parse(read('modules/Bilibili_app_compat.manifest.json'));
const text=read(manifest.module),config=YAML.parse(text);
assert.equal(sha(text),manifest.sha256);
assert.equal(sha(read('modules/Bilibili_remove_ads.stoverride')),manifest.sourceSha256);
assert.equal(config.version,manifest.version);assert.equal(manifest.exclusive,true);
assert.equal(manifest.url,`https://raw.githubusercontent.com/xian2023/stash-modules/main/${manifest.module}`);
assert(!text.includes('#!replace'));
assert.deepEqual(Object.keys(config.http).sort(),['mitm','body-rewrite','mock'].sort());
assert.deepEqual(config.http.mitm,['app.bilibili.com']);
assert.equal(config.rules,undefined);assert.equal(config['script-providers'],undefined);
assert.equal(config.http['body-rewrite'].length,3);assert.equal(config.http.mock.length,1);
const matches=(pattern,url)=>new RegExp(pattern.replace(/^\(\?i\)/,''),'i').test(url);
const rules=config.http['body-rewrite'].map(rule=>{const [match,jq]=rule.split(' response-jq ');return {match,jq};});
const hooks=url=>[...rules,...config.http.mock].filter(rule=>matches(rule.match,url));
// Unmodified transport for comments, DM and player resources on either host.
for(const host of ['grpc.biliapi.net','app.bilibili.com']) {
  for(const route of ['main.community.reply.v1.Reply/MainList','main.community.reply.v1.Reply/DetailList','main.community.reply.v1.Reply/DialogList','community.service.dm.v1.DM/DmSegMobile','community.service.dm.v1.DM/DmView','app.view.v1.View/ViewProgress','app.viewunite.v1.View/ViewProgress'])assert.equal(hooks(`https://${host}/bilibili.${route}`).length,0);
  if(host!=='app.bilibili.com')for(const route of ['splash/show','splash/list','feed/index','feed/index/story'])assert.equal(hooks(`https://${host}/x/v2/${route}?test=1`).length,0);
}
for(const host of ['api.bilibili.com','api.live.bilibili.com','app.bilibili.com.evil.example'])for(const route of ['splash/show','splash/list','feed/index','feed/index/story'])assert.equal(hooks(`https://${host}/x/v2/${route}?test=1`).length,0);
assert.equal(hooks('https://app.bilibili.com/x/v2/splash/event/list2?test=1').length,1);
const examples=[
  ['splash/show',{code:0,data:{show:[{id:'ad'}],event_list:[{id:'event'}],keep:'metadata'}},out=>assert.deepEqual(out,{code:0,data:{show:[],event_list:[],keep:'metadata'}})],
  ['feed/index',{data:{items:[{id:'normal',card_goto:'av',card_type:'small_cover_v2'},{id:'ad',card_goto:'av',card_type:'small_cover_v2',ad_info:{}},{banner_item:{}}]}},out=>assert.deepEqual(out.data.items,[{id:'normal',card_goto:'av',card_type:'small_cover_v2'}])],
  ['feed/index/story',{data:{items:[{id:'normal',card_goto:'av',story_cart_icon:{}},{card_goto:'vertical_ad_av'},{ad_info:{}}]}},out=>assert.deepEqual(out.data.items,[{id:'normal',card_goto:'av'}])],
];
for(const [route,input,verify] of examples) {
  const matched=rules.filter(rule=>matches(rule.match,`https://app.bilibili.com/x/v2/${route}?test=1`));assert.equal(matched.length,1);
  const result=spawnSync('jq',[matched[0].jq],{input:JSON.stringify(input),encoding:'utf8'});assert.equal(result.status,0,result.stderr);verify(JSON.parse(result.stdout));
}
const splash=JSON.parse(config.http.mock[0].text);assert.equal(config.http.mock[0]['status-code'],200);assert.equal(splash.code,0);assert.deepEqual(splash.data.show,[]);
console.log('PASS app compatibility: exact file/source hashes, only app MitM, native-only filtering, no grpc/comments/DM/player/resource hooks, organic feed/story retained');
