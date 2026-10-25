import fs from 'node:fs';
import crypto from 'node:crypto';
import {unzipSync,zipSync} from 'fflate';

export function buildBannerChronos(rawBase) {
  const base=JSON.parse(fs.readFileSync('modules/chronos.manifest.json','utf8'));
  const bytes=fs.readFileSync(base.path);
  const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
  if(sha(bytes)!==base.sha256)throw Error('Deferred Chronos base hash changed');
  const files=unzipSync(bytes),entry='res/src/danmaku/business/demand/entry_point/index_main.js';
  const source=Buffer.from(files[entry]).toString('utf8'),needle='Ps.ready()';
  if(source.split(needle).length!==2)throw Error('Banner UI insertion point changed');
  const controller=fs.readFileSync('src/chronos-banner-diagnostic.js','utf8');
  const call=`(${controller})(t,{running:()=>cron.Window.instance.running,schedule:(fn,seconds,repeat)=>cron.Task.scheduleTask(fn,seconds,repeat),cancel:id=>cron.Task.cancelTask(id),show:text=>ct.create(1).setText(text).show(),request:(url,callback)=>uc.create({url,method:"GET",format:"raw",timeout:2,retry:1}).invoke(callback)})`;
  files[entry]=Buffer.from(source.replace(needle,`${needle},${call}`));
  const tree=Object.fromEntries(Object.keys(files).sort().map(path=>[path,[files[path],{mtime:new Date(2000,0,1,0,0,0)}]]));
  const result=zipSync(tree,{level:9}),md5=crypto.createHash('md5').update(result).digest('hex'),path=`scripts/chronos/${md5}.zip`;
  fs.writeFileSync(path,result);
  const manifest={base,md5,path,url:`${rawBase}/${path}`,sha256:sha(result),display:'Bilibili native ShowToast, not an iOS system notification',nativeRuntimeVerified:false};
  fs.writeFileSync('modules/chronos.banner.manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
