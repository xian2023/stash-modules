import fs from 'node:fs';
import crypto from 'node:crypto';
import YAML from 'yaml';

// These are complete alternative overrides, not patches to enable on top of
// the main module. No #!replace: unrelated user configuration is preserved.
export function buildDiagnostics(main, rawBase) {
  const stages=[],hostProbes=[];
  const version='2026.10.25-diag.2';
  function publish(config,id,file,title,removed,collection=stages) {
    config.name=`B站排查 ${id} · ${title}`;
    config.desc='与主模块、评论直通、可选评论及其他 B站覆写互斥。完全退出 B站、重连 Stash 后，用相同视频复测。'+removed+'；见仓库分阶段排查说明。';
    config.version=version;
    config.category='诊断';
    const used=new Set((config.http.script||[]).map(h=>h.name));
    if(config['script-providers']) {
      config['script-providers']=Object.fromEntries(Object.entries(config['script-providers']).filter(([name])=>used.has(name)));
      if(!used.size)delete config['script-providers'];
    }
    const path=`modules/${file}.stoverride`;
    const text='# Mutually exclusive Bilibili diagnostic. Not a patch over the main module.\n'+YAML.stringify(config,{lineWidth:0});
    fs.writeFileSync(path,text);
    collection.push({id,title,removed,module:path,url:`${rawBase}/${path}`,sha256:crypto.createHash('sha256').update(text).digest('hex')});
    return config;
  }
  const noAirborne=structuredClone(main);
  noAirborne.http.script=noAirborne.http.script.filter(h=>!h.name.startsWith('bili-airborne-worker-'));
  let progressRemoved=0;
  for(const hook of noAirborne.http.script) {
    if(hook.match.includes('|ViewProgress')) {hook.match=hook.match.replace('|ViewProgress','');progressRemoved++;}
    if(hook.argument)hook.argument=JSON.stringify({...JSON.parse(hook.argument),sponsorBlock:false});
  }
  if(progressRemoved!==1)throw Error('ViewProgress diagnostic boundary changed');
  publish(noAirborne,'01','Bilibili_diag_01_no_airborne','关闭空降与播放器改写','移除独立空降端点与两个 ViewProgress 路径，保留评论/详情转发及其他处理');
  const noRelay=structuredClone(noAirborne);
  noRelay.http.script=noRelay.http.script.filter(h=>h.type!=='request');
  publish(noRelay,'02','Bilibili_diag_02_no_relay','再关闭请求转发','在 01 基础上移除全部 request 脚本，保留响应过滤、原生规则及解密');
  const noJS=structuredClone(noRelay);
  noJS.http.script=[];
  publish(noJS,'03','Bilibili_diag_03_no_js','再关闭全部 JS','在 02 基础上移除全部 JS 和 provider，仅保留原生改写/静态响应/规则及解密');
  const mitmOnly={name:'',desc:'',version:'',category:'',homepage:main.homepage,http:{mitm:[...main.http.mitm]}};
  publish(mitmOnly,'04','Bilibili_diag_04_mitm_only','仅保留 HTTPS 解密','仅添加与主模块相同的解密域名，不添加 JS、原生改写、静态响应或拦截规则');
  const hosts=[
    ['05','grpc','grpc.biliapi.net'],
    ['06','app','app.bilibili.com'],
    ['07','api','api.bilibili.com'],
    ['08','live','api.live.bilibili.com'],
    ['09','game','line3-h5-mobile-api.biligame.com'],
  ];
  if(JSON.stringify(hosts.map(h=>h[2]))!==JSON.stringify(main.http.mitm))throw Error('Single-host diagnostic coverage changed');
  for(const [id,label,host] of hosts) {
    const config={name:'',desc:'',version:'',category:'',homepage:main.homepage,http:{mitm:[host]}};
    publish(config,id,`Bilibili_diag_${id}_mitm_${label}`,`仅解密 ${host}`,`独立对照，只添加 ${host} 解密，不含广告处理；与 01–09 及所有 B站功能覆写互斥`,hostProbes);
  }
  const source=fs.readFileSync('modules/Bilibili_remove_ads.stoverride');
  fs.writeFileSync('modules/Bilibili_diagnostics.manifest.json',JSON.stringify({version,sourceVersion:main.version,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),exclusive:true,stages,hostProbes},null,2)+'\n');
}
