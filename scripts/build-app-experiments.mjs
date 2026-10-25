import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

export function buildAppExperiments(main,rawBase) {
  const baselinePath='modules/Bilibili_app_compat.stoverride';
  const baseline=fs.readFileSync(baselinePath,'utf8');
  const config=YAML.parse(baseline);
  const hook=structuredClone(main.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-')));
  if(!hook)throw Error('Response provider missing for isolated app test');
  const routes=[
    'app.show.v1.Popular/Index',
    'app.dynamic.v2.Dynamic/DynAll',
    'polymer.app.search.v1.Search/SearchAll',
  ];
  config.name='B站独立测试 01 · app 热门/动态/搜索';
  config.desc='完整替代测试版，与精简版/主模块/诊断及其他 B站覆写互斥。保留已正常的原生过滤，仅加 app 域名三个接口的响应 JS；不增加解密域名，不启用评论、弹幕、详情、播放资源、请求转发或空降。手机效果待测试。';
  config.version='2026.10.25-app-test.1';
  config.category='诊断';
  hook.match=String.raw`^https://app\.bilibili\.com/bilibili\.(?:app\.show\.v1\.Popular/Index|app\.dynamic\.v2\.Dynamic/DynAll|polymer\.app\.search\.v1\.Search/SearchAll)$`;
  hook.argument=JSON.stringify({displayUpList:'show',purifyComment:false,optimizeRequest:false,sponsorBlock:false,logLevel:'off'});
  config.http.script=[hook];
  config['script-providers']={[hook.name]:structuredClone(main['script-providers'][hook.name])};
  const module='modules/Bilibili_app_test_01_feed.stoverride';
  const text='# Complete alternative to the accepted app-only baseline; enable only one Bilibili module.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  const provider=config['script-providers'][hook.name];
  if(!provider.url.startsWith(rawBase+'/'))throw Error('Unexpected response provider source');
  fs.writeFileSync('modules/Bilibili_app_tests.manifest.json',JSON.stringify({
    version:config.version,exclusive:true,
    baseline:{module:baselinePath,url:`${rawBase}/${baselinePath}`,sha256:sha(baseline)},
    tests:[{id:'01',module,url:`${rawBase}/${module}`,sha256:sha(text),
      added:'Response-only filtering of app Popular/Index, Dynamic/DynAll and Search/SearchAll',
      routes:routes.map(route=>`https://app.bilibili.com/bilibili.${route}`),
      script:{url:provider.url,sha256:sha(fs.readFileSync(provider.url.slice(rawBase.length+1)))},
      deviceStatus:'awaiting-test',
    }],
  },null,2)+'\n');
}
