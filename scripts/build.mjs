import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const read = file => fs.readFileSync(file, 'utf8');
fs.mkdirSync('output/scripts', {recursive:true});
fs.mkdirSync('evidence', {recursive:true});
const original = read('upstream/Bilibili_remove_ads.loon-ua.lpx');
const fflate = read('node_modules/fflate/umd/index.js');
const common = read('src/stash-common.js');
const repository = JSON.parse(read('repository.json'));
const rawBase = `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${repository.branch}`;
const notice = '// Modified for Stash on 2026-10-24. Upstream kokoryh/Sparkle, GPL-3.0.\n// Includes fflate by Arjun Barrett, MIT. See bundled LICENSE and THIRD_PARTY_NOTICES.txt.\n';
const bundles = {};
for (const [name, suffix] of [['request','nt.run();'],['response','mn.run();']]) {
  const source = read(`upstream/scripts/proto_${name}.js`);
  if (!source.endsWith(suffix)) throw new Error(`Unexpected upstream ${name} entry point`);
  const result = notice + fflate + '\n' + common + '\n' + source.slice(0,-suffix.length) + '\n' + read(`src/stash-${name}.js`) + '\n' + suffix + '\n';
  const filename = `bilibili.${name}.stash.js`;
  fs.writeFileSync('output/scripts/' + filename, result);
  bundles[`bili-kokoryh-${name}`] = result;
}
// Live JSON handlers need no Loon-only API for the selected two routes.
bundles['bili-kokoryh-live'] = notice + read('upstream/scripts/live_json.js');
fs.writeFileSync('output/scripts/bilibili.live.stash.js', bundles['bili-kokoryh-live']);

const config = {
  name: '哔哩哔哩去广告 + 空降助手 · Loon 评论兼容',
  desc: '弹幕原请求直接发送，不再脚本转发；收到响应后限时查询空降（250ms保护），命中缓存不查询。保留 Loon 一级/楼中楼评论兼容链。停用其他 B站模块，实际速度需 iPhone 验证。',
  icon: 'https://raw.githubusercontent.com/luestr/IconResource/main/App_icon/120px/Bilibili.png',
  author: 'kokoryh (original scripts); Kelee (original rules); local Stash adaptation',
  homepage: `https://github.com/${repository.owner}/${repository.name}`,
  category: '去广告', version: '2026.10.25-preview.5',
  rules: [
    'DOMAIN,api.biliapi.com,REJECT', 'DOMAIN,app.biliapi.com,REJECT',
    'DOMAIN,api.biliapi.net,REJECT', 'DOMAIN,app.biliapi.net,REJECT',
    'AND,((DOMAIN-SUFFIX,chat.bilibili.com),(OR,((DOMAIN-KEYWORD,stun),(DOMAIN-KEYWORD,tracker),(DOMAIN-KEYWORD,p2p)))),REJECT'
  ],
  http: {
    mitm: ['grpc.biliapi.net','app.bilibili.com','api.bilibili.com','api.live.bilibili.com','line3-h5-mobile-api.biligame.com'],
    'url-rewrite': [], 'body-rewrite': [], mock: [], script: []
  }, 'script-providers': {}
};
const mapping = [];
for (const line of original.split('\n')) {
  if (!line.startsWith('response if ') && !line.startsWith('request if ')) continue;
  const regex = line.match(/~= \/(.*?)\/i then /)?.[1];
  if (!regex || line.includes(' then script(')) continue;
  const match = '(?i)' + regex;
  let converted;
  if (line.includes('response.json.jq(')) {
    const expr = JSON.parse(line.match(/response\.json\.jq\(("(?:\\.|[^"\\])*")\)/)[1]);
    converted = `${match} response-jq ${expr}`;
    config.http['body-rewrite'].push(converted);
  } else if (line.includes('response.json.jq_file(')) {
    const file = line.includes('tab_Bilibili') ? 'tab.jq' : 'mine.jq';
    const expr = read('upstream/jq/' + file).split('\n').map(s=>s.trim()).join(' ');
    converted = `${match} response-jq ${expr}`;
    config.http['body-rewrite'].push(converted);
  } else if (line.includes('response.json.delete(')) {
    const key = JSON.parse(line.match(/response\.json\.delete\((".*?")\)/)[1]);
    converted = `${match} response-jq del(.${key})`;
    config.http['body-rewrite'].push(converted);
  } else if (line.includes('response.body.mock(')) {
    const values = line.match(/response\.body\.mock\("text", ("(?:\\.|[^"\\])*"), (\d+)(, true)?\)/);
    if (!values) throw new Error('Unknown mock: ' + line);
    const binary = !!values[3];
    converted = { match, 'status-code': Number(values[2]), [binary?'base64':'text']: JSON.parse(values[1]), headers: binary ? {'Content-Type':'application/grpc','grpc-status':'0','grpc-encoding':'identity'} : {'Content-Type':'application/json; charset=utf-8'} };
    config.http.mock.push(converted);
  } else if (line.includes('reject_dict(200)')) {
    converted = `${match} - reject-dict`;
    config.http['url-rewrite'].push(converted);
  } else if (line.includes('response.header.add(')) {
    // All matching static gRPC mocks already have this header in their response.
    converted = 'grpc-status: 0 included in gRPC mock headers';
  } else throw new Error('Unhandled Loon rewrite: ' + line);
  mapping.push({loon:line,stash:converted});
}
const args = JSON.stringify({displayUpList:'show',purifyComment:true,optimizeRequest:true,sponsorBlock:true,logLevel:'off'});
config.http.script.push({
  match: '^https://(?:grpc\\.biliapi\\.net|app\\.bilibili\\.com)/bilibili\\.community\\.service\\.dm\\.v1\\.DM/DmSegMobile$',
  name: 'bili-kokoryh-request', type: 'request', 'require-body': true, 'binary-mode': true,
  timeout: 1, 'max-size': 1048576, argument: args
});
config.http.script.push({
  match: '^https://(?:grpc\\.biliapi\\.net|app\\.bilibili\\.com)/bilibili\\.community\\.service\\.dm\\.v1\\.DM/DmSegMobile$',
  name: 'bili-kokoryh-request', type: 'response', 'require-body': true, 'binary-mode': true,
  timeout: 2, 'max-size': 4194304, argument: args
});
const responseLine = original.split('\n').find(l=>l.startsWith('response if ') && l.includes('Bilibili_proto_response_kokoryh.js'));
const originalResponsePattern = responseLine.match(/~= \/(.*?)\/i then /)[1];
const commentAlternative = String.raw`|main\.community\.reply\.v1\.Reply\/MainList`;
if (!originalResponsePattern.includes(commentAlternative)) throw new Error('Upstream comment route changed');
config.http.script.push({
  match:String.raw`^https://(?:grpc\.biliapi\.net|app\.bilibili\.com)/bilibili\.(?:app\.viewunite\.v1\.View/View|main\.community\.reply\.v1\.Reply/(?:MainList|DetailList|DialogList))$`,
  name:'bili-kokoryh-request',type:'request','require-body':true,'binary-mode':true,
  timeout:10,'max-size':1048576,argument:args
});
config.http.script.push({
  match: '(?i)' + originalResponsePattern,
  name: 'bili-kokoryh-response', type: 'response', 'require-body': true, 'binary-mode': true,
  timeout: 3, 'max-size': 4194304, argument: args
});
const liveLine = original.split('\n').find(l=>l.startsWith('response if ') && l.includes('Bilibili_json_kokoryh.js'));
config.http.script.push({
  match: '(?i)' + liveLine.match(/~= \/(.*?)\/i then /)[1],
  name: 'bili-kokoryh-live', type: 'response', 'require-body': true,
  timeout: 3, 'max-size': 2097152, argument: JSON.stringify({logLevel:'off'})
});
for (const [name,payload] of Object.entries(bundles)) config['script-providers'][name] = {interval:86400,payload};
const header = '# Adapted 2026-10-24. Original: kokoryh/Sparkle (GPL-3.0), Kelee rules.\n# Preview: offline tests only; see README and source package for limitations.\n';
fs.writeFileSync('output/Bilibili_remove_ads.stoverride',header + YAML.stringify(config,{lineWidth:0}));
const local = structuredClone(config);
local.name += ' · 本地脚本';
for (const [i,name] of Object.keys(bundles).entries()) local['script-providers'][name] = {path:'./scripts/' + ['bilibili.request.stash.js','bilibili.response.stash.js','bilibili.live.stash.js'][i]};
fs.writeFileSync('output/Bilibili_remove_ads.local.stoverride', header + YAML.stringify(local,{lineWidth:0}));

// Publish the small override and versioned remote scripts as one Git commit.
// A new script build gets new provider names, so updates cannot reuse old caches.
const release = crypto.createHash('sha256').update(Object.values(bundles).join('\n')).digest('hex').slice(0,16);
const runtimeDir = `scripts/bilibili/${release}`;
fs.mkdirSync(runtimeDir, {recursive:true});
fs.mkdirSync('modules', {recursive:true});
const remote = structuredClone(config);
const providerFiles = ['request.js','response.js','live.js'];
remote['script-providers'] = {};
for (const [i,[name,payload]] of Object.entries(bundles).entries()) {
  fs.writeFileSync(`${runtimeDir}/${providerFiles[i]}`, payload);
  remote['script-providers'][`${name}-${release}`] = {url:`${rawBase}/${runtimeDir}/${providerFiles[i]}`,interval:86400};
}
for (const hook of remote.http.script) hook.name += `-${release}`;
fs.writeFileSync('modules/Bilibili_remove_ads.stoverride',header + YAML.stringify(remote,{lineWidth:0}));
// Keep the prior behavior available as a mutually exclusive diagnostic option.
const passthrough = structuredClone(remote);
passthrough.name = '哔哩哔哩去广告 + 空降助手 · 评论直通对照';
passthrough.desc = '不使用 Loon 的 View/MainList 请求转发，评论不执行 JS。仅供与主模块二选一排查；不是后台异步改写。';
passthrough.http.script = passthrough.http.script.filter(h=>!h.match.includes('(?:app\\.viewunite'));
for (const hook of passthrough.http.script) {
  if (hook.type === 'response' && hook.name.startsWith('bili-kokoryh-response-')) hook.match = '(?i)' + originalResponsePattern.replace(commentAlternative, '');
}
fs.writeFileSync('modules/Bilibili_passthrough.stoverride',header + YAML.stringify(passthrough,{lineWidth:0}));
const commentProviderName = `bili-kokoryh-response-${release}`;
const comments = {
  name:'哔哩哔哩评论去广告 · 可选',
  desc:'仅为评论直通对照版补充 MainList 响应过滤。主模块已内置 Loon 评论兼容，勿重复启用。',
  category:'去广告',version:config.version,homepage:config.homepage,
  http:{mitm:['grpc.biliapi.net','app.bilibili.com'],script:[{
    match:String.raw`^https://(?:grpc\.biliapi\.net|app\.bilibili\.com)/bilibili\.main\.community\.reply\.v1\.Reply/MainList$`,
    name:commentProviderName,type:'response','require-body':true,'binary-mode':true,
    timeout:1,'max-size':1048576,argument:JSON.stringify({purifyComment:true,sponsorBlock:false,logLevel:'off'})
  }]},
  'script-providers':{[commentProviderName]:remote['script-providers'][commentProviderName]}
};
fs.writeFileSync('modules/Bilibili_comments_optional.stoverride',header + YAML.stringify(comments,{lineWidth:0}));
fs.writeFileSync('modules/manifest.json',JSON.stringify({version:config.version,release,modules:['Bilibili_remove_ads.stoverride','Bilibili_passthrough.stoverride','Bilibili_comments_optional.stoverride'],scripts:Object.fromEntries(Object.values(remote['script-providers']).map(p=>[p.url,crypto.createHash('sha256').update(read(p.url.slice(rawBase.length+1))).digest('hex')]))},null,2)+'\n');
fs.writeFileSync('evidence/rule-mapping.json', JSON.stringify(mapping,null,2));
const hashes = {};
for (const folder of ['upstream','upstream/scripts','upstream/jq','output/scripts']) {
  for (const file of fs.readdirSync(folder)) {
    const full = path.join(folder,file);
    if (fs.statSync(full).isFile()) hashes[full] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
}
fs.writeFileSync('evidence/sha256.json', JSON.stringify(hashes,null,2));
console.log(`Built ${mapping.length} native mappings, ${config.http.script.length} script hooks; ${fs.statSync('output/Bilibili_remove_ads.stoverride').size} byte self-contained module.`);
