import fs from 'node:fs';
import crypto from 'node:crypto';
import { unzipSync, zipSync } from 'fflate';

export function buildChronos(rawBase) {
  const original='upstream/chronos/e5a968f1a5055bbe5c12e67b100a6dcb.zip';
  const bytes=fs.readFileSync(original);
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  if(sha!=='c82d74ac16e2d1ecb82f8f3d3cab2fc9fe5cc49d243964a9bd4a3877a642056e') throw Error('Pinned Chronos archive changed');
  const files=unzipSync(bytes);
  const file='res/src/danmaku/business/demand/entry_point/index_main.js';
  const source=Buffer.from(files[file]).toString('utf8');
  const needle='Ps.ready()';
  if(source.split(needle).length!==2) throw Error('Chronos insertion point changed');
  const controller=fs.readFileSync('src/chronos-deferred.js','utf8');
  const call=`(${controller})(t,{now:()=>Date.now(),running:()=>cron.Window.instance.running,schedule:(fn,seconds,repeat)=>cron.Task.scheduleTask(fn,seconds,repeat),cancel:id=>cron.Task.cancelTask(id),request:(url,callback)=>uc.create({url,method:"GET",format:"raw",timeout:3,retry:1}).invoke(callback)})`;
  files[file]=Buffer.from(source.replace(needle,`${needle},${call}`));
  // Entry order and timestamps are fixed, so repeated builds produce the same
  // bytes and package MD5. All original resource content is otherwise retained.
  const tree=Object.fromEntries(Object.keys(files).sort().map(path=>[path,[files[path],{mtime:new Date(2000,0,1,0,0,0)}]]));
  const result=zipSync(tree,{level:9});
  const md5=crypto.createHash('md5').update(result).digest('hex');
  const path=`scripts/chronos/${md5}.zip`;
  fs.mkdirSync('scripts/chronos',{recursive:true});
  fs.writeFileSync(path,result);
  const manifest={upstream:original,upstreamSha256:sha,md5,sha256:crypto.createHash('sha256').update(result).digest('hex'),path,url:`${rawBase}/${path}`,platform:'standard Bilibili universal iPhone package',nativeRuntimeVerified:false};
  fs.writeFileSync('modules/chronos.manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
