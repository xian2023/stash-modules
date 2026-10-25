import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';
import {buildBannerChronos} from './build-banner-chronos.mjs';

export function buildBannerProbe(rawBase) {
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  const fullPath='modules/Bilibili_compat_full_test.stoverride';
  const original=fs.readFileSync(fullPath,'utf8');
  const config=YAML.parse(original);
  const hook=config.http.script.find(h=>h.name.startsWith('bili-kokoryh-response-'));
  const oldName=hook.name;
  const provider=config['script-providers'][oldName];
  if(!provider.url.startsWith(rawBase+'/'))throw Error('Unexpected diagnostic provider source');
  const source=fs.readFileSync(provider.url.slice(rawBase.length+1),'utf8');
  const chronos=buildBannerChronos(rawBase);
  const descriptor=`const STASH_DEFERRED_CHRONOS = ${JSON.stringify({md5:chronos.base.md5,url:chronos.base.url})};`;
  if(source.split(descriptor).length!==2)throw Error('Banner Chronos descriptor changed');
  const uiSource=source.replace(descriptor,`const STASH_DEFERRED_CHRONOS = ${JSON.stringify({md5:chronos.md5,url:chronos.url})};`);
  if(!/mn\.run\(\);\s*$/.test(source))throw Error('Unexpected response entry point');
  const payload=uiSource.replace(/mn\.run\(\);\s*$/,fs.readFileSync('src/stash-banner-probe.js','utf8')+'\nmn.run();\n');
  const statusPayload=fs.readFileSync('src/stash-banner-status.js','utf8');
  const release=sha(payload+'\n'+statusPayload).slice(0,16),directory=`scripts/bilibili/banner-${release}`;
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${directory}/response.js`,payload);
  fs.writeFileSync(`${directory}/status.js`,statusPayload);
  config.name='B站横幅诊断 · B站播放器内提示';
  config.desc='临时互斥替代版，保持完整兼容过滤；修改播放器资源，在 B站画面内显示载入提示与最近60秒的接口统计，不发系统通知。未加载资源时无法显示；没有提示不能认定为未命中。只开此份，完全退出 B站并重连；结束后切回完整版。';
  config.version='2026.10.25-banner-diag.2';
  hook.name=`bili-banner-probe-${release}`;
  delete config['script-providers'][oldName];
  config['script-providers'][hook.name]={url:`${rawBase}/${directory}/response.js`,interval:86400};
  const statusName=`bili-banner-status-${release}`;
  config.http.script.unshift({match:String.raw`^https://api\.bilibili\.com/x/stash-banner/status$`,name:statusName,type:'request','require-body':false,timeout:1,'max-size':1024});
  config['script-providers'][statusName]={url:`${rawBase}/${directory}/status.js`,interval:86400};
  const module='modules/Bilibili_banner_diagnostic.stoverride';
  const text='# Temporary in-Bilibili diagnostic; no added decryption or advertising filters.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  fs.writeFileSync('modules/Bilibili_banner_diagnostic.manifest.json',JSON.stringify({
    version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,
    baseline:{module:fullPath,sha256:sha(original)},
    script:{url:`${rawBase}/${directory}/response.js`,sha256:sha(payload),baseUrl:provider.url,baseSha256:sha(source)},
    statusScript:{url:`${rawBase}/${directory}/status.js`,sha256:sha(statusPayload)},
    chronos,
    logging:'Bilibili native ShowToast plus optional local console; only bounded local counters saved for 60-second reports',
    limits:['needs app-host ViewProgress and accepted diagnostic Chronos resource','no visible toast does not prove no hook hit','recent counters are not attributed to a specific video','no visibility into undecrypted grpc paths','extra summary decode limited to 256 KiB; temporary CPU overhead'],
  },null,2)+'\n');
}
