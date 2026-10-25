// Temporary in-player diagnostics, using the package's traced ShowToast and
// raw URLRequest bridges. No system notifications or danmaku interception.
function installStashBannerDiagnostic(context, bridge) {
  'use strict';
  const manager=context.workinfoManager;
  const slot=context.__stashBannerDiagnostic||(context.__stashBannerDiagnostic={});
  if(typeof slot.dispose==='function')slot.dispose();
  let disposed=false,activeKey=null,generation=0,shown=false,lastMessage='';
  let tasks=[];
  function cancel() { for(const task of tasks)bridge.cancel(task);tasks=[]; }
  function show(text) { if(!disposed&&bridge.running())try{bridge.show(text);}catch(_){} }
  function format(content) {
    if(typeof content!=='string'||content.length>8192)throw Error('invalid report');
    const report=JSON.parse(content);
    if(report?.version!==1||report.windowSeconds!==60||!Array.isArray(report.events)||report.events.length>5)throw Error('invalid report');
    const allowed=['view','viewunite','relates','relates-unite','async-relates'];
    let details=0,related=0,before=0,after=0,relatedBefore=0,relatedAfter=0,failures=0,unfinished=0,unavailable=0;
    const count=value=>Number.isInteger(value)&&value>=0&&value<=1000000?value:0;
    for(const event of report.events) {
      if(!allowed.includes(event?.route))throw Error('invalid route');
      if(event.event==='fail-open'){failures++;continue;}
      if(event.event==='script-start'){unfinished++;continue;}
      if(event.event!=='processed')throw Error('invalid state');
      if(event.route==='view'||event.route==='viewunite')details++;else related++;
      if(event.before?.available!==true||event.after?.available!==true){unavailable++;continue;}
      before+=count(event.before?.bannerFields);after+=count(event.after?.bannerFields);
      relatedBefore+=count(event.before?.relatedIndicators);relatedAfter+=count(event.after?.relatedIndicators);
    }
    if(!report.events.length)return '横幅诊断：最近60秒未记录详情命中\n这不能确定广告来自哪个域名';
    if(failures||unfinished)return '横幅诊断：失败放行'+failures+'类，未完成'+unfinished+'类\n详情已处理'+details+'类，关联已处理'+related+'类';
    if(unavailable)return '横幅诊断：接口已处理，'+unavailable+'类摘要不可用\n数据过大或解码异常，计数未知';
    return '横幅诊断（最近60秒）\n详情'+details+'类，关联'+related+'类\n推广字段'+before+'→'+after+'，关联标记'+relatedBefore+'→'+relatedAfter;
  }
  function query(token) {
    if(disposed||token!==generation||!bridge.running())return;
    let settled=false,guard;
    const finish=response=>{
      if(settled)return;settled=true;
      if(guard!==undefined)bridge.cancel(guard);
      if(disposed||token!==generation||!bridge.running())return;
      let text;
      try {
        if(!response||response.expired)throw Error('request expired');
        text=format(response.content);
      }catch(_){text='横幅诊断：播放器已载入\n暂时无法读取接口处理记录';}
      if(text!==lastMessage){lastMessage=text;show(text);}
    };
    guard=bridge.schedule(()=>finish(null),3,false);tasks.push(guard);
    try {
      bridge.request('https://api.bilibili.com/x/stash-banner/status',finish);
    }catch(_){finish(null);}
  }
  function refresh() {
    if(disposed||!bridge.running())return;
    const info=manager.workInfo;
    if(!info?.isReady)return;
    const key=String(info.workId)+':'+String(info.videoId);
    if(activeKey===key&&shown)return;
    activeKey=key;shown=true;lastMessage='';cancel();const token=++generation;
    show('横幅诊断：B站播放器已载入');
    // Read a small local synthetic endpoint twice, not the video or ad APIs.
    tasks.push(bridge.schedule(()=>query(token),4,false));
    tasks.push(bridge.schedule(()=>query(token),20,false));
  }
  function invalidate() {++generation;activeKey=null;shown=false;cancel();}
  const listener=manager.addListener({onWorkWillChange:invalidate,onCurrentWorkChanged:invalidate,onCurrentWorkInfoChanged:refresh});
  slot.runningChanged=()=>{if(!bridge.running())invalidate();else refresh();};
  if(!slot.listening){context.addEventListener({onRunningStateChanged:()=>slot.runningChanged?.()});slot.listening=true;}
  refresh();
  slot.dispose=()=>{disposed=true;invalidate();manager.removeListener(listener);slot.runningChanged=undefined;slot.dispose=undefined;};
  return slot.dispose;
}
