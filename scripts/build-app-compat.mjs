import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

// A bounded feature add-back on the phone-confirmed app-only MitM baseline.
// Never redirect or block the grpc host to try to work around its TLS path.
export function buildAppCompatibility(main,rawBase) {
  const routes=[
    'https://app.bilibili.com/x/v2/splash/show?test=1',
    'https://app.bilibili.com/x/v2/feed/index?test=1',
    'https://app.bilibili.com/x/v2/feed/index/story?test=1',
  ];
  const regex=pattern=>new RegExp(pattern.replace(/^\(\?i\)/,''),'i');
  const body=routes.map(url=>{
    const matches=main.http['body-rewrite'].filter(rule=>regex(rule.split(' response-jq ')[0]).test(url));
    if(matches.length!==1)throw Error(`App compatibility route changed: ${url}`);
    return matches[0];
  });
  const splash=main.http.mock.filter(mock=>regex(mock.match).test('https://app.bilibili.com/x/v2/splash/list?test=1'));
  if(splash.length!==1)throw Error('App compatibility splash mock changed');
  const config={
    name:'哔哩哔哩去广告 · app 域名精简兼容预览',
    desc:'基于 05 卡、06 正常的真机对照，只解密 app.bilibili.com，恢复开屏/首页/竖屏推荐的原生过滤。不含 JS、评论/弹幕处理、请求转发、空降和域名拦截；grpc 广告不处理。与主模块、诊断版及其他 B站覆写互斥，手机效果待验收。',
    version:'2026.10.25-app-preview.1',
    category:'去广告',homepage:main.homepage,author:main.author,icon:main.icon,
    http:{mitm:['app.bilibili.com'],'body-rewrite':body,mock:structuredClone(splash)},
  };
  const module='modules/Bilibili_app_compat.stoverride';
  const text='# Mutually exclusive limited feature preview. See docs/BILIBILI_DIAGNOSIS.md.\n'+YAML.stringify(config,{lineWidth:0});
  fs.writeFileSync(module,text);
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync('modules/Bilibili_app_compat.manifest.json',JSON.stringify({
    version:config.version,module,url:`${rawBase}/${module}`,sha256:sha(text),exclusive:true,
    sourceVersion:main.version,sourceSha256:sha(fs.readFileSync('modules/Bilibili_remove_ads.stoverride')),
    baseline:'User reports 05 (grpc-only MitM) slow, 06 (app-only MitM) normal, and app-preview.1 loading normal',
    verification:{status:'user-reported-loading-normal',scope:'Overall loading reported normal on standard Bilibili iPhone app',adCoverage:'Not individually verified',appVersion:null,stashVersion:null},
    features:['app splash list mock','app splash show/event native filter','app home feed native filter','app story feed native filter'],
    excluded:['grpc MitM','other MitM hosts','JavaScript','request relay','comments','danmaku','airborne','domain rejects'],
  },null,2)+'\n');
}
