import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

const repository=JSON.parse(fs.readFileSync('repository.json','utf8'));
const rawBase=`https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${repository.branch}`;
const script=fs.readFileSync('src/x-response.js','utf8');
const sha256=crypto.createHash('sha256').update(script).digest('hex');
const release=sha256.slice(0,16);
const directory=`scripts/x/${release}`;
const name=`x-timeline-ads-${release}`;
fs.mkdirSync(directory,{recursive:true});
fs.mkdirSync('modules',{recursive:true});
fs.writeFileSync(`${directory}/response.js`,script);
const homepage=`https://github.com/${repository.owner}/${repository.name}`;
// Device feedback: even the script-free diagnostic breaks native-app refresh.
// Retire both old URLs without touching unrelated MitM lists or HTTP hooks.
const retired={
  name:'X 原生去广告 · 已停用',
  desc:'原生 X App 在仅开启 HTTPS 解密、不执行脚本时仍无法加载帖子，原生适配暂停。此版本无解密域名、脚本或规则，不再去广告。请停用旧版和诊断版并重连 Stash；网页版另见 X_Web_remove_ads.stoverride。',
  category:'兼容性',version:'2026.10.24-preview.2',homepage
};
fs.writeFileSync('modules/X_remove_ads.stoverride','# Native-app filter retired after device-confirmed MitM-only failure.\n'+YAML.stringify(retired,{lineWidth:0}));
fs.writeFileSync('modules/X_remove_ads.manifest.json',JSON.stringify({version:retired.version,release:'disabled',module:'X_remove_ads.stoverride',scripts:{}},null,2)+'\n');
const diagnostic={
  name:'X 联通诊断 · 已结束并停用',
  desc:'真机已确认无脚本的 HTTPS 解密也导致 X 帖子加载失败。诊断结束，此版本不再添加解密域名、脚本或规则。请停用或删除旧诊断版并重连 Stash。',
  category:'诊断',version:'2026.10.24-diag.2',homepage
};
fs.writeFileSync('modules/X_MITM_diagnostic.stoverride','# Diagnostic retired; do not keep the old MitM-only version enabled.\n'+YAML.stringify(diagnostic,{lineWidth:0}));

// Separate opt-in web experiment, matching the published web-only boundary.
// Do not add native API domains back without a successful transport check.
const operations=['HomeTimeline','HomeLatestTimeline','TweetDetail'];
const graphql=String.raw`^https://x\.com/i/api/graphql/[^/?#]+/(?:${operations.join('|')})(?:\?|$)`;
const config={
  name:'X 网页版去广告 · 预览',
  desc:'仅供 Safari/PWA 的 x.com 网页时间线与详情，过滤明确推广标记；仅解密 x.com，不包含 api.x.com 或 api.twitter.com。不能去除原生 App 广告，尚未本机验证；若影响加载请停用。',
  category:'去广告',version:'2026.10.24-web-preview.1',homepage,
  http:{
    mitm:['x.com'],
    script:[{match:graphql,name,type:'response','require-body':true,'binary-mode':false,timeout:2,'max-size':2097152}]
  },
  'script-providers':{[name]:{url:`${rawBase}/${directory}/response.js`,interval:86400}}
};
fs.writeFileSync('modules/X_Web_remove_ads.stoverride','# Independent WEB-ONLY X Stash filter. GPL-3.0-only. See docs/X_AD_FILTER.md.\n'+YAML.stringify(config,{lineWidth:0}));
fs.writeFileSync('modules/X_Web_remove_ads.manifest.json',JSON.stringify({version:config.version,release,module:'X_Web_remove_ads.stoverride',scripts:{[config['script-providers'][name].url]:sha256}},null,2)+'\n');
console.log(`Retired native X filter and diagnostic; built web-only preview: ${fs.statSync('modules/X_Web_remove_ads.stoverride').size} bytes, script ${Buffer.byteLength(script)} bytes, ${operations.length} GraphQL read operations.`);
