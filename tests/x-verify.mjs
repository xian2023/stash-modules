import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import YAML from 'yaml';

const source=fs.readFileSync('src/x-response.js','utf8');
const config=YAML.parse(fs.readFileSync('modules/X_remove_ads.stoverride','utf8'));
const results=[];
const tests=[];
const test=(name,fn)=>tests.push([name,fn]);
const ordinary=(id='1')=>({entryId:'tweet-'+id,sortIndex:'1850000000000000001',content:{entryType:'TimelineTimelineItem',itemContent:{itemType:'TimelineTweet',tweet_results:{result:{rest_id:id,legacy:{full_text:'ordinary tweet',extended_entities:{media:[{type:'video',video_info:{variants:[{url:'https://video.twimg.com/test.mp4'}]}}]}}}}}}});
const ad=()=>({entryId:'tweet-ad',content:{itemContent:{promotedMetadata:{advertiser_id:'advertiser'},tweet_results:{result:{rest_id:'ad'}}}}});
const cursor=()=>({entryId:'cursor-bottom-123',content:{entryType:'TimelineTimelineCursor',cursorType:'Bottom',value:'opaque-pagination-token'}});
const home=entries=>({data:{home:{home_timeline_urt:{instructions:[{type:'TimelineAddEntries',entries},{type:'TimelineTerminateTimeline',direction:'Top'}]}}}});
function run(value,{status=200,raw=false}={}) {
  const body=raw?value:JSON.stringify(value);let output;let calls=0;let effects=0;
  const forbidden=()=>{effects++;throw Error('Unexpected side effect');};
  vm.runInNewContext(source,{$response:{status,body},$request:{url:'https://api.x.com/graphql/query/HomeTimeline'},$done:value=>{calls++;output=value;},$httpClient:{get:forbidden,post:forbidden},$persistentStore:{read:forbidden,write:forbidden},console:{log:forbidden},setTimeout:forbidden},{timeout:1000});
  assert.equal(calls,1);assert.equal(effects,0);return {output,body,result:output.body?JSON.parse(output.body):undefined};
}
const entries=r=>r.data.home.home_timeline_urt.instructions[0].entries;
test('Connection diagnostic exactly isolates the existing MitM hosts without any scripts or rules',()=>{
  const diagnostic=YAML.parse(fs.readFileSync('modules/X_MITM_diagnostic.stoverride','utf8'));
  assert.deepEqual(diagnostic.http,{mitm:config.http.mitm});
  assert.deepEqual(Object.keys(diagnostic).sort(),['name','desc','category','version','homepage','http'].sort());
});
test('Module only intercepts allowlisted read responses, with size/time limits',()=>{
  assert.deepEqual(config.http.mitm,['api.x.com','api.twitter.com','x.com','twitter.com']);
  for(const hook of config.http.script) {assert.equal(hook.type,'response');assert.equal(hook.timeout,2);assert.equal(hook['max-size'],2097152);assert.equal(hook['binary-mode'],false);assert(config['script-providers'][hook.name]);}
  const match=url=>config.http.script.some(h=>new RegExp(h.match).test(url));
  for(const host of ['api.x.com','api.twitter.com','x.com','twitter.com']) {
    for(const prefix of ['graphql','i/api/graphql']) for(const op of ['HomeTimeline','HomeLatestTimeline','TweetDetail','SearchTimeline','UserTweets','UserMedia']) assert(match(`https://${host}/${prefix}/query/${op}?variables=x`));
    for(const op of ['CreateTweet','FavoriteTweet','CreateRetweet','DeleteTweet','CreateBookmark','DmNewMessage','UserByScreenName','Login','HomeTimelineUnexpected']) assert(!match(`https://${host}/graphql/query/${op}`));
  }
  for(const path of ['2/timeline/home.json','2/timeline/profile/123.json','2/timeline/conversation/123.json','2/search/adaptive.json']) assert(match('https://api.twitter.com/'+path+'?cursor=x'));
  assert(!match('https://x.com/home'));assert(!match('https://x.com/login'));assert(!match('https://video.twimg.com/clip.mp4'));assert(!match('https://api.x.com.evil.example/graphql/id/HomeTimeline'));
});
test('Published runtime exactly matches source and manifest hash',()=>{
  const manifest=JSON.parse(fs.readFileSync('modules/X_remove_ads.manifest.json'));
  for(const [url,hash] of Object.entries(manifest.scripts)) {
    const p=new URL(url).pathname.split('/').slice(4).join('/');assert.equal(fs.readFileSync(p,'utf8'),source);
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'),hash);
  }
  assert(Buffer.byteLength(source)<12000);assert(Buffer.byteLength(fs.readFileSync('modules/X_remove_ads.stoverride'))<3000);
});
test('Home promoted metadata removed; organic videos, order and cursors preserved',()=>{
  const organic=ordinary();const end=cursor();const r=run(home([ordinary('0'),ad(),organic,end]));
  assert.deepEqual(entries(r.result),[ordinary('0'),organic,end]);assert.equal(r.result.data.home.home_timeline_urt.instructions[1].direction,'Top');
});
test('Promoted ids work inside detail/search module prefixes',()=>{
  for(const entryId of ['promoted-tweet-1-hash','conversationthread-1-promoted-tweet-2-hash','search-conversation-1-promoted-tweet-2-hash','promoted-user-3','promoted-trend-4']) {
    const item=ordinary('ad');item.entryId=entryId;assert.deepEqual(entries(run(home([item,cursor()])).result),[cursor()]);
  }
});
test('Only promoted module items are removed from mixed conversation modules',()=>{
  const keep={entryId:'conversationthread-1-tweet-2',item:{itemContent:ordinary('2').content.itemContent}};
  const bad={entryId:'conversationthread-1-promoted-tweet-3-hash',item:{itemContent:ordinary('3').content.itemContent}};
  const r=run(home([{entryId:'conversationthread-1',content:{entryType:'TimelineTimelineModule',items:[keep,bad]}}]));
  assert.deepEqual(entries(r.result)[0].content.items,[keep]);
});
test('Promoted metadata in module item is removed without deleting organic siblings',()=>{
  const keep={entryId:'organic',item:{itemContent:ordinary().content.itemContent}};
  const bad={entryId:'not-marked-id',item:{itemContent:{promoted_metadata:{id:'ad'}}}};
  const r=run(home([{entryId:'module-1',content:{items:[bad,keep]}}]));assert.deepEqual(entries(r.result)[0].content.items,[keep]);
});
test('Empty ad-only module removed; following cursor retained',()=>{
  const bad={entryId:'promoted-tweet-3-hash',item:{itemContent:{}}};const r=run(home([{entryId:'module-1',content:{items:[bad]}},cursor()]));assert.deepEqual(entries(r.result),[cursor()]);
});
test('TimelineAddToModule removes ad item and keeps normal item',()=>{
  const keep={entryId:'tweet-1',item:{itemContent:ordinary().content.itemContent}};
  const r=run({data:{timeline:{instructions:[{type:'TimelineAddToModule',moduleEntryId:'module-1',moduleItems:[{entryId:'promoted-tweet-2-hash'},keep]}]}}});
  assert.deepEqual(r.result.data.timeline.instructions[0].moduleItems,[keep]);
});
test('Promoted replace/pin instructions removed while organic replacements preserved',()=>{
  const instructions=[{type:'TimelineReplaceEntry',entryIdToReplace:'a',entry:ad()},{type:'TimelinePinEntry',entry:ad()},{type:'TimelineReplaceEntry',entryIdToReplace:'b',entry:ordinary()}];
  const r=run({data:{timeline:{instructions}}});assert.deepEqual(r.result.data.timeline.instructions,[instructions[2]]);
});
test('Legacy addEntries and promoted metadata inside legacy tweet supported',()=>{
  const bad={entryId:'tweet-ad',content:{item:{content:{tweet:{id:'ad',promotedMetadata:{id:'p'}}}}}};
  const keep={entryId:'tweet-1',content:{item:{content:{tweet:{id:'1'}}}}};
  const r=run({globalObjects:{tweets:{'1':{id_str:'1'}}},timeline:{instructions:[{addEntries:{entries:[bad,keep,cursor()]}}]}});
  assert.deepEqual(r.result.timeline.instructions[0].addEntries.entries,[keep,cursor()]);assert.equal(r.result.globalObjects.tweets['1'].id_str,'1');
});
test('Legacy addToModule/replaceEntry instructions supported',()=>{
  const r=run({timeline:{instructions:[{addToModule:{moduleItems:[{entryId:'promoted-tweet-1-hash'},{entryId:'tweet-2'}]}},{replaceEntry:{entry:ad()}}]}});
  assert.equal(r.result.timeline.instructions.length,1);assert.deepEqual(r.result.timeline.instructions[0].addToModule.moduleItems,[{entryId:'tweet-2'}]);
});
test('Plain organic response remains byte-for-byte untouched',()=>{
  const input=JSON.stringify(home([ordinary(),cursor()]),null,2);const r=run(input,{raw:true});assert.equal(Object.keys(r.output).length,0);
});
test('Ad markers in ordinary text, quoted posts and retweets do not hide outer post',()=>{
  const item=ordinary();item.content.itemContent.tweet_results.result.legacy.full_text='Article about promoted-tweet-123 and promotedMetadata';
  item.content.itemContent.tweet_results.result.quoted_status_result={result:{promotedMetadata:{id:'nested'}}};
  item.content.itemContent.tweet_results.result.legacy.retweeted_status_result={result:{promoted_metadata:{id:'nested'}}};
  assert.equal(Object.keys(run(home([item,cursor()])).output).length,0);
});
test('Null/false metadata is retained; ordinary suggestions are not filtered',()=>{
  const item=ordinary();item.content.itemContent.promotedMetadata=null;const who={entryId:'who-to-follow-1',content:{items:[{entryId:'user-1',item:{itemContent:{promotedMetadata:false}}}]}};
  assert.equal(Object.keys(run(home([item,who])).output).length,0);
});
test('Cursors preserved even if unfamiliar metadata is attached',()=>{
  const end=cursor();end.content.promotedMetadata={id:'unexpected'};const r=run(home([ad(),end]));assert.deepEqual(entries(r.result),[end]);
});
test('Unrelated entries arrays and non-timeline instructions remain unchanged',()=>{
  const input={data:{unrelated:{entries:[ad()]},instructions:[{type:'BusinessUpdate',entries:[ad()]},{type:'TimelineUnknownInstruction',entries:[ad()]}]}};
  assert.equal(Object.keys(run(input).output).length,0);
});
test('Timeline __typename fallback supported without guessing other schemas',()=>{
  const input=home([ad(),ordinary()]);const instruction=input.data.home.home_timeline_urt.instructions[0];delete instruction.type;instruction.__typename='TimelineAddEntries';
  assert.deepEqual(entries(run(input).result),[ordinary()]);
});
test('Malformed JSON, empty, HTML and binary bodies fail open',()=>{
  for(const body of ['','<html>promotedMetadata</html>','{"promotedMetadata":','null',new Uint8Array([1,2])]) assert.equal(Object.keys(run(body,{raw:true}).output).length,0);
});
test('HTTP error responses stay untouched',()=>{
  for(const status of [204,301,401,403,429,500]) assert.equal(Object.keys(run(home([ad()]),{status}).output).length,0);
});
test('Unsafe numeric IDs preserved by passing original body through',()=>{
  const input=JSON.stringify(home([ad(),ordinary()])).replace('"rest_id":"1"','"rest_id":9007199254740993');
  assert.equal(Object.keys(run(input,{raw:true}).output).length,0);
  const r=run(home([ad(),ordinary('9007199254740993')]));assert.equal(entries(r.result)[0].content.itemContent.tweet_results.result.rest_id,'9007199254740993');
});
test('Numeric-looking strings and escaped quotes do not trigger numeric guard',()=>{
  const keep=ordinary();keep.content.itemContent.tweet_results.result.legacy.full_text='9007199254740993 \\" promotedMetadata';
  assert.deepEqual(entries(run(home([ad(),keep])).result),[keep]);
});
test('Large body and object budget preserve complete original response',()=>{
  const body=JSON.stringify({data:home([ad()]),padding:'x'.repeat(2097152)});assert.equal(Object.keys(run(body,{raw:true}).output).length,0);
  const root=home([ad()]);root.extra=Array.from({length:50001},()=>({x:1}));assert.equal(Object.keys(run(root).output).length,0);
});
test('Unknown schemas and legitimate GraphQL errors retained',()=>{
  assert.equal(Object.keys(run({data:{unknown:{promotedMetadata:{id:'ad'}}}}).output).length,0);
  const input=home([ad(),ordinary()]);input.errors=[{message:'partial data',extensions:{code:'TEST'}}];const r=run(input);assert.deepEqual(r.result.errors,input.errors);
});

let passed=0;
for(const [name,fn] of tests) {try{fn();passed++;results.push({name,passed:true});console.log('PASS X',name);}catch(error){results.push({name,passed:false,error:String(error)});console.error('FAIL X',name,error);}}
fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/x-test-results.json',JSON.stringify({passed,total:tests.length,scope:'Node VM + synthetic JSON fixtures; no X/iPhone runtime',results},null,2));
console.log(`X: ${passed}/${tests.length} passed`);if(passed!==tests.length)process.exitCode=1;
