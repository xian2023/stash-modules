import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

export function buildBannerDashboard(rawBase) {
  const read=path=>fs.readFileSync(path,'utf8'),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  const baselinePath='modules/Bilibili_compat_full_test.stoverride',baseline=read(baselinePath),config=YAML.parse(baseline);
  const hook=config.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-')),oldName=hook.name,provider=config['script-providers'][oldName];
  if(!provider.url.startsWith(rawBase+'/'))throw Error('Unexpected dashboard response source');
  const baseSource=read(provider.url.slice(rawBase.length+1));
  if(!/mn\.run\(\);\s*$/.test(baseSource))throw Error('Unexpected dashboard response entry point');
  // Keep the normal Chronos descriptor; the panel never needs the toast ZIP.
  const transport=read('src/stash-banner-transport.js');
  const entry=transport+"\nstashBannerTransport('responses');\n";
  const payload=entry+baseSource.replace(/mn\.run\(\);\s*$/,read('src/stash-banner-probe.js')+'\nmn.run();\n');
  const page=read('src/banner-dashboard.html'),status=read('src/stash-banner-status.js');
  const template=read('src/stash-banner-dashboard.js');
  if(template.split('STASH_BANNER_DASHBOARD_HTML').length!==2||template.split('STASH_BANNER_STATUS_HANDLER').length!==2)throw Error('Dashboard template boundary changed');
  const worker=transport+'\n'+template.replace('STASH_BANNER_DASHBOARD_HTML',()=>JSON.stringify(page)).replace('STASH_BANNER_STATUS_HANDLER',()=>status);
  const request=read('src/stash-banner-request.js').replace('STASH_BANNER_TRANSPORT_HELPER',()=>transport);
  const release=sha(payload+'\n'+worker+'\n'+request).slice(0,16),directory=`scripts/bilibili/banner-panel-${release}`;
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${directory}/response.js`,payload);fs.writeFileSync(`${directory}/dashboard.js`,worker);fs.writeFileSync(`${directory}/request.js`,request);
  config.name='B站横幅诊断 · Safari 本机面板';
  config.desc='不依赖播放器提示或日志搜索。只开此份，在 Safari 打开 https://api.bilibili.com/x/stash-banner/dashboard，开始本轮后切到 B站复现，再回页面刷新。保留完整兼容过滤和解密范围；面板及状态由 Stash 本机响应，不上传数据。';
  config.version='2026.10.25-banner-panel.2';
  hook.name=`bili-banner-panel-probe-${release}`;delete config['script-providers'][oldName];
  config['script-providers'][hook.name]={url:`${rawBase}/${directory}/response.js`,interval:86400};
  const workerName=`bili-banner-dashboard-${release}`;
  config.http.script.unshift({match:String.raw`^https://api\.bilibili\.com/x/stash-banner/(?:dashboard|status|reset)$`,name:workerName,type:'request','require-body':false,timeout:2,'max-size':1024});
  config['script-providers'][workerName]={url:`${rawBase}/${directory}/dashboard.js`,interval:86400};
  const requestName=`bili-banner-request-${release}`;
  config.http.script.unshift({match:String.raw`^https://(?:(?:app|api)\.bilibili\.com/(?!x/stash-)|app\.bilibili\.com/x/stash-banner/check$)`,name:requestName,type:'request','require-body':false,timeout:1,'max-size':1024});
  config['script-providers'][requestName]={url:`${rawBase}/${directory}/request.js`,interval:86400};
  const module='modules/Bilibili_banner_dashboard.stoverride',text='# Mutually exclusive local dashboard; normal player resources and advertising filters are preserved.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  const chronos=JSON.parse(read('modules/chronos.manifest.json'));
  fs.writeFileSync('modules/Bilibili_banner_dashboard.manifest.json',JSON.stringify({version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,
    baseline:{module:baselinePath,sha256:sha(baseline)},dashboard:'https://api.bilibili.com/x/stash-banner/dashboard',
    responseScript:{url:`${rawBase}/${directory}/response.js`,sha256:sha(payload)},dashboardScript:{url:`${rawBase}/${directory}/dashboard.js`,sha256:sha(worker)},requestScript:{url:`${rawBase}/${directory}/request.js`,sha256:sha(request)},
    assets:{[chronos.url]:chronos.sha256},windowSeconds:60,transportWindowSeconds:600,deviceStatus:'awaiting-test',limits:['no player or toast dependency for panel','no records does not prove grpc origin','counters not attributed to a video','detail summaries 60 seconds; armed request/response presence 10 minutes', 'temporary request metadata hooks on app/api hosts; original requests passed through', 'presence sampled per fixed category, not complete HTTP capture']},null,2)+'\n');
}
