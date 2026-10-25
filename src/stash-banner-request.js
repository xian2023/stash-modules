STASH_BANNER_TRANSPORT_HELPER
(function(){
  if($request.url==='https://app.bilibili.com/x/stash-banner/check'){
    var result=$request.method==='GET'?stashBannerTransport('check'):{saved:false};
    $done({response:{status:result.saved?200:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'https://api.bilibili.com','Vary':'Origin','X-Content-Type-Options':'nosniff'},body:JSON.stringify({probe:'app-request',saved:result.saved===true})}});
    return;
  }
  stashBannerTransport('requests');
  // Pass the original request through without reading or replacing its body.
  $done({});
})();
