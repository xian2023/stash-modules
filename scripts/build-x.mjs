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
const operations=['HomeTimeline','HomeLatestTimeline','TweetDetail','SearchTimeline','UserTweets','UserTweetsAndReplies','UserMedia','ListLatestTweetsTimeline','Bookmarks','CommunityTweetsTimeline','CommunityMediaTimeline'];
const graphql=String.raw`^https://(?:api\.)?(?:twitter|x)\.com/(?:i/api/)?graphql/[^/?#]+/(?:${operations.join('|')})(?:\?|$)`;
const legacy=String.raw`^https://api\.(?:twitter|x)\.com/2/(?:timeline/(?:home|profile/\d+|conversation/\d+|list)|search/adaptive)\.json(?:\?|$)`;
const config={
  name:'X 去广告 · 时间线净化',
  desc:'过滤 X/Twitter 时间线和推文详情内有明确 promoted 标记的广告；保留分页与普通媒体，不额外请求服务器。JSON 接口适配预览，需 iPhone 实测；不能保证移除全部广告。',
  category:'去广告',version:'2026.10.24-preview.1',
  homepage:`https://github.com/${repository.owner}/${repository.name}`,
  http:{
    mitm:['api.x.com','api.twitter.com','x.com','twitter.com'],
    script:[graphql,legacy].map(match=>({match,name,type:'response','require-body':true,'binary-mode':false,timeout:2,'max-size':2097152}))
  },
  'script-providers':{[name]:{url:`${rawBase}/${directory}/response.js`,interval:86400}}
};
fs.writeFileSync('modules/X_remove_ads.stoverride','# Independent X/Twitter Stash filter. GPL-3.0-only. See docs/X_AD_FILTER.md.\n'+YAML.stringify(config,{lineWidth:0}));
fs.writeFileSync('modules/X_remove_ads.manifest.json',JSON.stringify({version:config.version,release,module:'X_remove_ads.stoverride',scripts:{[config['script-providers'][name].url]:sha256}},null,2)+'\n');
// Isolate connection/HTTPS-engine failures from script startup and JSON changes.
// This is deliberately the exact same MitM list, with no scripts or rewrites.
const diagnostic={
  name:'X 联通诊断 · 不去广告',
  desc:'仅用于定位帖子加载失败：先停用 X 去广告及其他 X 覆写，再单独启用此项、重连 Stash 并重开 X。仅启用与 preview.1 相同的 HTTPS 解密主机；无脚本、无正文处理、无拦截规则。测试后停用。',
  category:'诊断',version:'2026.10.24-diag.1',homepage:config.homepage,
  http:{mitm:[...config.http.mitm]}
};
fs.writeFileSync('modules/X_MITM_diagnostic.stoverride','# Temporary connection diagnostic, not an ad blocker.\n'+YAML.stringify(diagnostic,{lineWidth:0}));
console.log(`Built X module: ${fs.statSync('modules/X_remove_ads.stoverride').size} bytes, script ${Buffer.byteLength(script)} bytes, ${operations.length} GraphQL read operations.`);
