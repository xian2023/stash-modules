import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

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
  if(!/mn\.run\(\);\s*$/.test(source))throw Error('Unexpected response entry point');
  const payload=source.replace(/mn\.run\(\);\s*$/,fs.readFileSync('src/stash-banner-probe.js','utf8')+'\nmn.run();\n');
  const release=sha(payload).slice(0,16),directory=`scripts/bilibili/banner-${release}`;
  fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(`${directory}/response.js`,payload);
  config.name='B站横幅诊断 · 保持完整兼容过滤';
  config.desc='临时互斥替代版，过滤、解密域名及空降与完整兼容测试相同。仅在本机日志输出 BiliBanner 接口命中、成功/放行及字段计数，不记录正文或账号信息；不是横幅修复版。只开此份，复现后搜索 BiliBanner，结束后切回完整版。';
  config.version='2026.10.25-banner-diag.1';
  hook.name=`bili-banner-probe-${release}`;
  delete config['script-providers'][oldName];
  config['script-providers'][hook.name]={url:`${rawBase}/${directory}/response.js`,interval:86400};
  const module='modules/Bilibili_banner_diagnostic.stoverride';
  const text='# Temporary local-summary diagnostic; no added decryption or advertising filters.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  fs.writeFileSync('modules/Bilibili_banner_diagnostic.manifest.json',JSON.stringify({
    version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,
    baseline:{module:fullPath,sha256:sha(original)},
    script:{url:`${rawBase}/${directory}/response.js`,sha256:sha(payload),baseUrl:provider.url,baseSha256:sha(source)},
    logging:'local console only: hit, processed or fail-open; boolean/count/type metadata only',
    limits:['no visibility into undecrypted grpc paths','no hit does not prove grpc origin','extra summary decode limited to 256 KiB; temporary CPU overhead'],
  },null,2)+'\n');
}
