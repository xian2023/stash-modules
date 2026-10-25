import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

export function buildFullCompatibility(main,rawBase) {
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  // Enumerate registered app routes. Never capture grpc, nested replies or
  // DmSegMobile as a side effect of enabling the complete functional test.
  const contentRoutes=[
    'app.show.v1.Popular/Index',
    'app.dynamic.v2.Dynamic/DynAll',
    'polymer.app.search.v1.Search/SearchAll',
    'app.view.v1.View/View',
    'app.viewunite.v1.View/View',
    'app.view.v1.View/RelatesFeed',
    'app.viewunite.v1.View/RelatesFeed',
    'app.viewunite.v1.View/AIRelateAsync',
    'main.community.reply.v1.Reply/MainList',
  ];
  const playerRoutes=[
    'app.view.v1.View/ViewProgress',
    'app.viewunite.v1.View/ViewProgress',
    'app.playurl.v1.PlayURL/PlayView',
    'app.playerunite.v1.Player/PlayViewUnite',
    'pgc.gateway.player.v2.PlayURL/PlayView',
    'community.service.dm.v1.DM/DmView',
  ];
  const config=structuredClone(main);
  config.name='哔哩哔哩完整兼容测试 · 避开 grpc 解密';
  config.desc='一次恢复去广告、视频下方推广过滤、评论响应过滤、直播及延后空降。排除已卡顿的 grpc 解密，不重放原请求；恢复 api/直播/游戏域名解密，手机待测试。与精简版、测试01、主模块及其他 B站覆写互斥，只开此份；grpc 请求仍直通，相关广告和空降可能不生效。';
  config.version='2026.10.25-compat-full-test.1';
  config.category='诊断';
  config.http.mitm=config.http.mitm.filter(host=>host!=='grpc.biliapi.net');
  if(config.http.mitm.length!==4)throw Error('Full compatibility host boundary changed');
  config.rules=config.rules.filter(rule=>!/^DOMAIN,(?:api|app)\.biliapi\.(?:com|net),REJECT$/.test(rule));
  if(config.rules.length!==1)throw Error('Alternate API reject boundary changed');
  config.http.mock=config.http.mock.filter(mock=>!mock.match.includes(String.raw`grpc\.biliapi\.net`));
  if(config.http.mock.length!==3)throw Error('gRPC-only mock boundary changed');
  config.http.script=config.http.script.filter(hook=>hook.type!=='request'||hook.name.startsWith('bili-airborne-worker-'));
  const response=config.http.script.find(hook=>hook.name.startsWith('bili-kokoryh-response-'));
  if(!response)throw Error('Full compatibility response script missing');
  const escape=route=>route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  response.match=String.raw`^https://app\.bilibili\.com/bilibili\.(?:`+[...contentRoutes,...playerRoutes].map(escape).join('|')+')$';
  response.argument=JSON.stringify({...JSON.parse(response.argument),optimizeRequest:false});
  const used=new Set(config.http.script.map(hook=>hook.name));
  config['script-providers']=Object.fromEntries(Object.entries(config['script-providers']).filter(([name])=>used.has(name)));
  const module='modules/Bilibili_compat_full_test.stoverride';
  const text='# Complete alternative compatibility test; keep the accepted app-only module for rollback.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  const baseline=path=>({module:path,url:`${rawBase}/${path}`,sha256:sha(fs.readFileSync(path))});
  const scripts={};
  for(const provider of Object.values(config['script-providers'])) {
    if(!provider.url.startsWith(rawBase+'/'))throw Error('Unexpected full compatibility provider');
    scripts[provider.url]=sha(fs.readFileSync(provider.url.slice(rawBase.length+1)));
  }
  const chronos=JSON.parse(fs.readFileSync('modules/chronos.manifest.json','utf8'));
  fs.writeFileSync('modules/Bilibili_compat_full_test.manifest.json',JSON.stringify({
    version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,deviceStatus:'awaiting-test',
    baseline:baseline('modules/Bilibili_app_compat.stoverride'),previousTest:baseline('modules/Bilibili_app_test_01_feed.stoverride'),
    source:baseline('modules/Bilibili_remove_ads.stoverride'),
    scripts,assets:{[chronos.url]:chronos.sha256},
    groups:{contentAndComments:contentRoutes,playerAndAirborne:playerRoutes,live:['live JSON response'],native:['native jq','JSON mocks','URL reject-dict','P2P rule'],addedMitm:['api.bilibili.com','api.live.bilibili.com','line3-h5-mobile-api.biligame.com']},
    exclusions:['grpc MitM','grpc-only mocks','original request relay','alternate API rejects','DmSegMobile hooks','nested reply hooks'],
    limits:['grpc traffic is not filtered','airborne needs app-host ViewProgress and accepted Chronos resource','added MitM hosts are not yet phone-verified'],
    bisectPlan:'If slow, keep the accepted baseline intact and split content/native versus player/airborne/live processing with the same four MitM hosts; if four-host MitM alone is slow, split added hostnames first.',
  },null,2)+'\n');
}
