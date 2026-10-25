import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

export function buildRefactored(rawBase) {
  const read=path=>fs.readFileSync(path,'utf8');
  const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
  const baselinePath='modules/Bilibili_compat_full_test.stoverride',baseline=read(baselinePath);
  if(sha(baseline)!=='bdfc9e53c726817ec0d29450b678524ef4e0a0174466a570e4aecb3e0c150939')throw Error('Refactored baseline changed');
  const previous=JSON.parse(read('modules/Bilibili_compat_full_test.manifest.json'));
  const config=YAML.parse(baseline);
  config.name='哔哩哔哩去广告 + 延后空降 · 评论直通重构版';
  config.desc='适用于已确认 TUN 兼容模式能改善 grpc 解密的设备。恢复 grpc/app 视频详情与推广过滤，保留延后空降；移除原请求重放，一级评论、楼中楼和普通弹幕分段均不挂脚本，因此评论广告暂不处理。与旧主模块、兼容版及所有诊断版互斥，只开此份；保持已验证的 TUN 兼容模式。手机效果待验收。';
  config.version='2026.10.26-refactor.1';
  config.category='影音';
  config.http.mitm.unshift('grpc.biliapi.net');
  const routes=[...previous.groups.contentAndComments,...previous.groups.playerAndAirborne]
    .filter(route=>route!=='main.community.reply.v1.Reply/MainList');
  if(routes.length!==14)throw Error('Refactored route boundary changed');
  const response=config.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
  const escape=route=>route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  response.match=String.raw`^https://(?:grpc\.biliapi\.net|app\.bilibili\.com)/bilibili\.(?:`+routes.map(escape).join('|')+')$';
  response.argument=JSON.stringify({...JSON.parse(response.argument),purifyComment:false,optimizeRequest:false});
  const module='modules/Bilibili_refactored.stoverride';
  const text='# Full alternative for TUN-compatible devices; comments and DM segments pass through.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  const scripts={};
  for(const provider of Object.values(config['script-providers'])){
    if(!provider.url.startsWith(rawBase+'/'))throw Error('Unexpected refactored provider');
    scripts[provider.url]=sha(fs.readFileSync(provider.url.slice(rawBase.length+1)));
  }
  fs.writeFileSync('modules/Bilibili_refactored.manifest.json',JSON.stringify({
    version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,deviceStatus:'awaiting-test',
    baseline:{module:baselinePath,sha256:sha(baseline)},scripts,assets:previous.assets,
    responseHosts:['grpc.biliapi.net','app.bilibili.com'],responseRoutes:routes,
    exclusions:['all original request relay','MainList/DetailList/DialogList scripts','DmSegMobile hooks','grpc-only mocks','alternate API rejects','diagnostic probes'],
    limits:['requires user-confirmed TUN compatibility mode; does not change that setting','comment ads are not filtered','MitM still affects connections on the shared grpc hostname','combined banner removal and comment latency require phone verification'],
  },null,2)+'\n');
}
