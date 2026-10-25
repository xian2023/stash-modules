# B站卡顿：互斥分阶段定位

目标是找出哪一组处理与当前手机的卡顿有关，而不是继续假定空降服务是唯一原因。主模块暂保持 `2026.10.25-preview.6` 原样；本页对照模块为 `2026.10.25-diag.2`，由同一版本自动构建。源版本及文件哈希在 `modules/Bilibili_diagnostics.manifest.json`。

## 最新结果：完整兼容版其他正常，详情广告仍在

用户已反馈完整兼容测试“其他都正常”，并确认剩余横幅带“广告”标记；截图显示播放器正下方的游戏下载横幅和推荐列表中的游戏广告卡。记录为本轮整体加载正常、两处广告仍可见，不据此单独宣称空降或每个接口已验收。

本地独立审查与上游对照均未发现能由截图直接证实的漏字段：已覆盖的统一详情会删除顶层 `cm`，关联卡会处理广告类型、`cmStock` 和推广 ID。部分 protobuf 模型会保留未知字段；新字段、其他接口、缓存和未解密路径都仍是候选，不能在没有命中证据时继续扩大黑名单。

### 当前方案：Safari 本机面板

用户反馈 `banner-diag.2` 在 B站内完全没有显示；随后 `banner-panel.1` 的手机截图确认面板和状态读取可用，返回 `events:[]`、`storageState:ready`，但没有接口命中证据。该结果不能区分资源未加载、原生提示未显示或目标接口未命中，改用独立的 [Bilibili_banner_dashboard.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_banner_dashboard.stoverride)，版本 `2026.10.25-banner-panel.3`。旧原生提示版保留作对照，正常完整兼容版不改动。

最新 `banner-panel.2` 手机结果：用户已复现广告，`armed:true`、剩余 563 秒，自检约 37 秒前；记录 app-json（27 秒前）、api-other（13 秒前）、api-json（3 秒前），`responses:[]`、`events:[]`。这确认跨脚本本机存储和 app 请求探针可以工作；本轮没有记录到目标 protobuf 请求或过滤入口，但不能排除 hook 条件/大小门槛、未观察路径、缓存等因素，尚不能证明 grpc 来源，更不能宣称已找到漏广告字段。

第三版补充 REST/其他路径的脱敏形状和独立响应头观察。路径逐段只保留固定词表，未知段（包括数字 ID、任意 token/文字）全部替换为 `_`，不保留 query、请求头/正文或响应正文。不同接口可能合并成同一形状。最多保留 48 项，达到上限后替换旧项并显示提示；并发写入仍可能丢记录。响应观察使用 `require-body:false`，只记录 HTTP 状态与响应头被脚本观察到的时间，不能代表正文加载完成。其正则由已有全部原生改写/mock 的匹配式生成排除项，并排除 protobuf 和本机端点，避免抢占既有处理。请求元数据 hook 的 max-size 从 1 KiB 提至 4 MiB；大小门槛也是旧探针漏观察的一种可能，仍不将 body 传入该脚本。

1. 停用其他 B站覆写，只启用本面板模块，划掉 B站并重新连接 Stash。
2. 在 iPhone Safari 打开 **https://api.bilibili.com/x/stash-banner/dashboard**。看到“Stash 本机面板”说明页面请求已由脚本接管；“状态接口已连接”说明摘要读取链可用。
3. 点“开始本轮诊断”。同时执行 app 域名请求自检，单独显示成功/未通过。它是 Safari 发起的合成请求，不算 B站接口命中。随后切到 B站，重新打开视频并复现横幅。
4. 尽快切回 Safari，点“刷新结果”，点“复制诊断摘要”粘贴到聊天，或截取新增“接口路径（脱敏形状）”部分。第二版起把固定类别请求/响应入口保留在 10 分钟观察窗口内，最近详情字段摘要仍为 60 秒；超出观察窗口需重新开始。诊断结束切回完整兼容版。

面板新增三个精确本机端点：GET `dashboard` 返回静态 HTML，GET `status` 返回白名单摘要，POST `reset` 清空独立摘要键 `bili.stash.banner.ui.v1`，并重置独立入口键 `bili.stash.banner.transport.v1`；任一写入失败均不宣称开始成功。新增 app-host 精确 GET `check` 自检端点只写本轮自检时间并返回合成 JSON，CORS 仅允许本面板 origin。页面没有第三方资源，状态请求不携带浏览器凭证。存储读取错误、损坏数据和写入失败均明确显示，不会伪装成“未命中”；无效或缺失的统计为未知，不转换成零。

面板使用普通 Chronos 资源，无需诊断 Toast 包、播放器初始化或视频保持前台。它保留完整兼容版四个解密域名和广告过滤，详情字段探针仍限制在五类详情/关联接口，并在原 15 条响应脚本最前方加独立入口标记。临时请求脚本覆盖 app/api 两个已解密域名，按固定类别及脱敏路径形状记录出现情况；不读取正文/请求头、不记录 query，不请求外部服务，不改动原请求；排除所有本机 stash 端点以免遮挡空降 worker。需要点击开始才写记录，10 分钟后停止，每类别 5 秒限频；记录不是请求次数，可能受并发写入影响，不是完整时间线。不加入 grpc 解密或原请求转发。页面和状态由 Stash 本机直接响应；模块未接管时原站并不提供此页面。如果打不开，提供 Safari 的错误文字或截图，先定位接管链，不据此推断广告字段。

“已处理”仅表示该接口脚本完成；字段/采样关联标记计数不是画面广告数量，也不绑定当前视频。面板正常但没有记录时，候选仍包括接口未命中、响应脚本未运行、记录过期及其他路径，不能据此断定 grpc 来源。记录被清空只代表本轮摘要重置，不会清空 B站缓存。

第一版的面板及状态读取已由手机截图确认可用，未确认任何详情响应命中。第三版本地验证请求脚本只放行原请求、自检与业务记录分离、入口标记、观察窗口/限频、路径词表脱敏/上限、响应观察与原生处理隔离、复制及原响应结果一致；浏览器使用合成摘要，不是 iPhone 入口命中证据。离线测试另覆盖路由约束、两项诊断键重置、脱敏、过期、存储异常、配置与基线一致及资源指纹。第二版 app 自检及 JSON 类请求记录已经手机确认；第三版脱敏路径和响应头观察仍待实测。

### 保留对照：在 B站画面内显示诊断

用户找不到脚本日志，并明确要求显示到 Bilibili App 内；同一诊断地址已升级为 `2026.10.25-banner-diag.2`：[Bilibili_banner_diagnostic.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_banner_diagnostic.stoverride)。这不是 Stash/iOS 系统通知，不要求打开系统通知权限，也不是给视频写入弹幕。

1. 刷新远程覆写，确认版本为 `banner-diag.2`；停用完整兼容版及其他 B站覆写，只启用这份诊断版。
2. 从多任务划掉 B站，重连 Stash 后打开同一视频。新资源有单独 MD5/URL，初次约需下载 1 MiB；不要求清缓存、卸载 App 或删除证书。
3. 播放器资源成功载入且工作信息 ready 后，尝试通过 B站原生 `ShowToast` 显示“横幅诊断：B站播放器已载入”。随后约 4 秒和 20 秒各读取一次本机摘要，结果变化时再次显示，不循环轮询。
4. 直接提供 B站内出现的提示文字或截图。若完全没有提示，也反馈“没有播放器提示”，不用再搜索日志。诊断结束切回完整兼容版。

可能看到的结果：

| 画面内提示 | 能确认的范围 |
| --- | --- |
| B站播放器已载入 | 诊断资源初始化已走到提示调用；仍需以手机实际显示确认原生桥生效 |
| 详情/关联已处理，推广字段或关联标记前后计数 | 最近 60 秒相应 app 路由的处理摘要；这些是字段/标记数量，不是画面广告数量 |
| 最近 60 秒未记录详情命中 | 本机近期没有保存可用目标记录；不能确定广告来自哪个域名 |
| 接口已处理，摘要不可用/计数未知 | 额外摘要超限、缺失或解码失败，不能误作 `0→0` 或零广告 |
| 失败放行/未完成 | 已记录目标脚本开始或失败，但没有完整成功结果 |
| 暂时无法读取接口处理记录 | 资源已运行，但本机报告链未取得有效结果；不等同于没有请求 |

**完全没有提示不能当作“模块已启用但接口没命中”。** B站内展示依赖两种 app-host ViewProgress 路径之一命中，并且 App 成功下载、接受和初始化新的 Chronos 资源，还需要原生 `ShowToast` 真正显示。如果资源请求只走未解密的 grpc，或旧资源仍在当前播放器里运行，这条展示通道本身就不存在。Stash HTTP 脚本不能在这种情况下凭空创建 B站原生界面。

原生 Toast 的位置、显示时长和是否被 App 抑制由 App 控制；没有假定 `setDuration` 可延长原生短提示。代码从原 ZIP 的真实 `ct` 类验证 `ct.create(1).setText(...).show()` 只发送 `ShowToast` 消息，未使用系统通知接口。新增诊断包在已用的延后空降包上只修改同一 JS 入口，保留既有空降控制器，其余 ZIP 内容逐字节不变；原完整兼容版、精简版、测试 01 与原普通 Chronos 包均保持原样。

### 本机摘要与低开销边界

两种 View、两种 RelatesFeed 和 AIRelateAsync 的诊断仍只观察已知字段，不新增广告过滤或解密域名。额外解码限 256 KiB；计数、布尔值、模块类型与顶层未知字段编号会进入原有可选日志，同时在独立本机键 `bili.stash.banner.ui.v1` 最多保留五类接口的最新事件。损坏 JSON 自动恢复，读取时只采纳最近 60 秒记录。

播放器通过精确合成端点 `https://api.bilibili.com/x/stash-banner/status` 读取经白名单缩减的计数，Stash 本地直接响应，不转发原站，不查询第三方。报告没有文案、正文、URL/query、Cookie、Authorization、视频/用户 ID 或未知字段值。它是近期窗口统计，**不声称属于当前视频**，快速切视频时尤其需要保留这一解释。卡片统计有采样上限，顶层未知字段也不能排除嵌套的未知广告字段。

每次前台视频初始化最多两次本机报告读取，保留 3 秒逻辑保护；暂停到后台会取消任务并作废回调，切换视频使用代次检查，迟到结果不覆盖新视频提示，相同文字不重复显示。这些读取独立于视频/弹幕响应，不添加 DmSegMobile hook，不改变原空降服务的裸数组协议。仍有临时 CPU、本机网络和资源首次下载成本，不能据静态检查保证手机调度完全无影响。

离线验证包括：原广告过滤输出一致、两种 ViewProgress 仅指向独立诊断资源、真实 Toast 类的原生消息契约、状态报告脱敏/过期/超限、损坏存储恢复、未知计数不转零、前后台与视频代次、查询保护及迟到结果、ZIP 其他文件不变、脚本与资源哈希。手机已反馈未显示；资源接受及原生提示通道仍未确认，当前改用上方 Safari 面板。

日志仍可选：`BiliBanner` 的 `script-start/hit/processed/fail-open` 只含固定标签与元数据；`console.log` 输出到独立脚本日志文件。[Stash 脚本接口说明](https://stash.wiki/script/syntax-and-interface)

源码对照：[Biliverse 视频详情与关联响应处理](https://github.com/Biliverse/ADBlock/blob/main/src/process/Response.mjs)。它支持已知 `cm`/关联过滤机制，不证明本次手机的实际传输路径。

## 已完成的前一轮：测试 01

用户在测试 01 上反馈“视频下面有广告横幅，其他正常”。尚未抓包确认横幅来自哪个域名或字段，也未独立确认三个 app 接口均命中。因此记录为加载表现正常、横幅仍在，不把它当作所有响应过滤和广告覆盖均已验收。用户随后要求“一步到位，如果有问题再二分法定位”，改用下方完整兼容测试，不再要求先测单组测试 02。

用户已确认：全关正常、01–04 均卡、05（只解密 `grpc.biliapi.net`）卡、06（只解密 `app.bilibili.com`）正常。这使 grpc 域名解密成为能单独复现的条件；尚未区分 TLS/HTTP 连接兼容与解密后触发其他有效配置，不能宣称已确认某个具体协议缺陷。07–09 未反馈，也不能视为已通过。

已在 06 的正常基线上加回小范围的原生去广告，用户随后反馈精简版正常：[Bilibili_app_compat.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_app_compat.stoverride)，版本 `2026.10.25-app-preview.1`。它只解密 app 域名，包含开屏列表 mock、开屏 show/event、首页 feed 和竖屏 story 三条原生正文过滤。无 JS/provider、请求转发、域名拒绝、评论/弹幕处理和空降；不改写播放器资源，也不通过阻断、DNS 映射或 URL 改写强迫 grpc 请求转到 app。

**停用主模块、全部诊断版、评论直通/可选版和其他 B站覆写，只开此兼容预览，划掉 B站、重连 Stash 后重开。** 本轮用户反馈为“这个是正常的”，确认精简版整体加载表现正常；并未逐项报告各类广告是否过滤成功，也未提供 App/Stash 版本。本次保留这份覆写的所有字节不变，只更新说明和验证记录。后续新增功能应使用单独对照文件，不能直接覆盖这份已可用的基线，也不要求重复测试已经确认正常的相同配置。若后续它重新出现卡顿，可与 06 对照，再拆分这三条过滤和开屏 mock。

走 grpc、api、直播或其他未解密域名的广告不会处理；新接口或其他形态的首页广告也可能保留，当前版本不具备完整原模块的覆盖率。基础配置及其他覆写中的 grpc 解密不会被此文件自动删除，必须保持与 06 对照相同的有效配置条件。原完整预览仍保留作开发对照，不作为该设备的流畅方案。

## 当前测试：一次恢复完整兼容功能

远程地址：[Bilibili_compat_full_test.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_compat_full_test.stoverride)，版本 `2026.10.25-compat-full-test.1`。这是完整替代配置，**停用精简版、测试 01、旧主模块、诊断及其他 B站覆写，只开这一份，划掉 B站、重连 Stash 后重开**。已正常的精简版与测试 01 文件保持原样，方便直接切回。

一次启用以下功能组：

| 功能组 | 本次处理 |
| --- | --- |
| 内容与评论 | app 域名热门、动态、搜索、两种 View、两种 RelatesFeed、AIRelateAsync、MainList 响应过滤，包括详情推广字段 |
| 播放器与空降 | app 域名两种 ViewProgress 资源改写、播放响应、DmView；播放器稳定推进约 8 秒后独立查询，后续监测中插广告段 |
| 直播 | 原直播 JSON 过滤与直播原生规则 |
| 原生界面 | 原 jq、JSON 静态响应、URL 改写和 P2P 规则；沿用上游标签页/我的页面净化及播放响应调整 |
| 解密 | app、api、api.live、line3 游戏四个域名，继续排除 grpc |

沿用上游 `mine/myinfo` 的会员展示字段及播放器能力/提示字段调整，是本完整预览继承的客户端响应行为，不代表实际会员权益发生变化；页面布局和播放行为异常也应纳入对应功能组排查。

删除所有原请求转发 hook 和其 provider，不对一级评论/楼中楼做重放，也不拦截 DmSegMobile；唯一 request 脚本是独立合成空降端点。删除 grpc-only 静态响应以及四条备用 API 的域名 REJECT，避免强迫客户端改走某个主机。内容脚本只精确命中实际注册的 15 条 app 响应路径，不把总正则里的主机替换后直接放大匹配。

**这次新增的三个解密域名尚未真机验证。** 07–09 对照没反馈，不能因为 app-only 正常就认定四域名都正常。实际走 grpc 的详情横幅、评论或其他广告仍不会过滤；如果 ViewProgress 只走 grpc，播放器资源无法由此覆写改写，空降也可能不生效。即使走 app，原生资源接受、真实桥接和服务数据命中仍需验证。空降只处理已标注、位于视频时间轴上的广告片段；没有标记或平台独立插播不能据未跳过判定处理链失败。

本轮反馈只需三项：“加载是否正常；视频下方横幅是否消失；空降是否生效”。若异常，说明是弹幕/评论等待、播放异常，还是界面变化即可；不必先把所有旧诊断再测一遍。若横幅仍在，下一轮结合截图和接口域名确认来源，而不是重新打开已复现卡顿的 grpc 解密。

### 有问题时的二分

1. 卡顿先切回已正常的精简版。新建互斥替代配置，将内容/评论/原生处理与播放器/空降/直播处理分成两部分，并保持同样四个解密域名，逐次缩小出问题的处理组。
2. 如果两部分都卡，先验证只解密这四域名是否也卡；若纯解密仍卡，优先二分三个新增域名，而不是继续改脚本超时。
3. 若只有一组卡，在该组内继续二分；若两组单独正常而合并异常，则查组合/并发和跨组状态，不能据单组正常宣布修复。

`modules/Bilibili_compat_full_test.manifest.json` 记录功能分组、15 条响应路径、基线/原主模块/测试 01 的哈希和运行资产。离线检查包含详情推广字段、正常相关推荐、评论、gzip、未知字段、错误放行和两种 app ViewProgress 到 Chronos 包的改写链；worker 和播放器生命周期由现有独立测试覆盖。上述检查不等同于手机完整功能通过。

## 保留对照：独立功能测试 01

用户此前授权开始独立功能测试。保留此前的完整替代配置：[Bilibili_app_test_01_feed.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_app_test_01_feed.stoverride)，版本 `2026.10.25-app-test.1`。**不要叠加在精简版上：停用精简版、主模块、诊断版及其他 B站覆写，只开测试 01，划掉 B站、重连 Stash 后重开。**

测试 01 保留已反馈正常的精简版全部原生过滤，解密列表仍只有 `app.bilibili.com`；唯一新增功能组是一份二进制响应过滤脚本，精确覆盖该域名下的三个接口：

| 页面 | 接口路径 |
| --- | --- |
| 热门 | `/bilibili.app.show.v1.Popular/Index` |
| 动态 | `/bilibili.app.dynamic.v2.Dynamic/DynAll` |
| 搜索 | `/bilibili.polymer.app.search.v1.Search/SearchAll` |

不启用 grpc 解密，不启用请求转发、评论、弹幕、视频详情、相关推荐、播放接口、ViewProgress 或空降。复用现有内容寻址的响应 provider，但只有上述三条路由会执行；其余处理不会被这些 hook 调用。独立只读审查及实际脚本沙箱检查确认这三条处理不额外联网、不修改 Chronos；仍会完整缓冲响应、解压并重编码 protobuf，不能把零外部请求视为零耗时。

**先测这一份，不用重测 01–09 或测试未经验证的其他域名。** 固定网络、节点和同一视频，先打开热门、动态与搜索，再检查播放、弹幕、一级评论和楼中楼。反馈“测试 01：加载正常/卡；卡在哪个页面；广告有无变化”即可。有条件时查看 Stash 请求记录是否出现上述 app 域名接口；不需要请求头、令牌或正文。若没有命中这三条接口，正常结果只能说明未发现副作用，不能据此确认脚本在该手机上运行正常或已恢复相应去广告。

如果卡顿，停用测试 01，重新只开原精简版；不继续叠加功能。若已命中的接口正常，再通过另一份独立配置测试下一个功能组；空降和其他域名仍待后续测试。

已反馈正常的精简覆写字节保持不变，哈希固定为 `67edc948f37ddd9353bbab3c133794daa4b827ac66c953b39900ca6789fc559c`。`modules/Bilibili_app_tests.manifest.json` 记录基线、测试覆写和脚本哈希，以及真机反馈状态。离线验证包含实际发布脚本的三个 protobuf fixture、gzip、正常项保留、未知字段和错误透传，不替代本轮手机反馈。

## 先建立基线，再逐级关闭

**这些都是完整替代覆写，不能叠加在主模块上。每次 B站相关覆写最多开一份。**

先停用主模块、旧 B站模块、评论直通版、可选评论版及其他重叠 B站覆写，完全退出 B站（从多任务界面划掉），重新连接 Stash，再打开同一视频。如果全部停用仍卡，先暂停下列阶梯，检查基础配置、节点/网络与 App 本身。

基线正常时，先只启用 01。如果仍卡，停用 01，只启用 02；依此往后。**第一步恢复正常就停下，反馈前后两档，不必继续全测。**

| 阶段 | 相比上一档关闭 | 仍然保留 | 远程地址 |
| --- | --- | --- | --- |
| 01 | 全部空降处理、两个 ViewProgress 资源改写路径和独立查询端点 | 详情/评论请求转发、其他响应 JS、原生规则与解密 | [Bilibili_diag_01_no_airborne.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_01_no_airborne.stoverride) |
| 02 | 再关闭全部 request 脚本，即详情/一级评论/楼中楼转发 | 响应 JS 过滤、原生规则与解密 | [Bilibili_diag_02_no_relay.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_02_no_relay.stoverride) |
| 03 | 再关闭全部 JS 及 script provider | 原生 jq/正文改写、静态响应、URL 改写、拦截规则及解密 | [Bilibili_diag_03_no_js.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_03_no_js.stoverride) |
| 04 | 再关闭所有原生改写、静态响应和拦截规则 | 本覆写只添加与主模块相同的五个 HTTPS 解密域名 | [Bilibili_diag_04_mitm_only.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_04_mitm_only.stoverride) |

**每次换档都要完全退出 B站、重连 Stash，再重开 App。** 不要只切换开关后继续使用已经打开的播放器：其中可能还有旧 Chronos 控制器。停用 ViewProgress 改写也不等于删除了 App 的 ZIP 缓存；本流程不要求清空账号、卸载 App 或删除证书。

固定同一节点/网络、同一视频与画质，依次观察播放、弹幕、一级评论和楼中楼。每档复测两次，区分首次播放器资源下载与持续卡顿；不要只用“首次变快/变慢”一次读数作最终结论。

简短反馈格式即可：

```text
全部 B站覆写关：正常 / 仍卡
01：弹幕约__秒；一级评论__秒；楼中楼__秒
02（若需要）：……
哔哩哔哩版本：__；Stash 版本：__
```

## 如何解读

- 基线正常、01 正常：空降/播放器资源改写这一组值得进一步拆分；不能仅凭这一步认定是服务网络或自定义包中的某一个函数。
- 01 卡、02 正常：优先查详情/评论请求转发组，再分别区分 View、MainList 和楼中楼，不能直接归因所有评论过滤。
- 02 卡、03 正常：优先查剩余响应 JS、正文缓冲和解析，再分 protobuf/直播处理。
- 03 卡、04 正常：优先查原生改写、静态 gRPC 响应和拒绝规则，不能把“无 JS”当作完全直通。
- 04 仍卡、全部 B站覆写关闭正常：优先查新增解密域名与有效 HTTP 配置，结合 TLS/HTTP/2 错误和耗时定位。04 不添加脚本，但基础配置或别的覆写可能已有脚本，开启解密会让它们开始命中。
- 所有档位及基线都卡：此时无法用本模块的功能差异解释，先处理节点、基础规则和 App 状态。

## 全关正常、01–04 都卡：改查单域名解密

本轮用户已反馈：关闭全部 B站覆写后正常，01–04 均卡。04 文件只有元信息和 `http.mitm`，没有广告拦截、模拟响应、脚本或空降处理。因此，这组结果不支持“本模块修改广告回包导致客户端等待”的解释；当前优先查解密后的连接和其他配置，而非继续调整空降时机。尚不能据此确认是证书、HTTP/2、App 校验或其他某一种具体原因。

以下五份都是**独立的单域名对照**，不是累加步骤。先停用 01–04、主模块及其他 B站覆写，每次只开一份。优先测 05，再停用 05 测 06；若其中某份复现，就先记录日志，不必立即把后续全部测完。每次完全退出 B站、重连 Stash 后用同一视频复测。

| 对照 | 仅添加的解密域名 | 远程地址 |
| --- | --- | --- |
| 05 | `grpc.biliapi.net` | [Bilibili_diag_05_mitm_grpc.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_05_mitm_grpc.stoverride) |
| 06 | `app.bilibili.com` | [Bilibili_diag_06_mitm_app.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_06_mitm_app.stoverride) |
| 07 | `api.bilibili.com` | [Bilibili_diag_07_mitm_api.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_07_mitm_api.stoverride) |
| 08 | `api.live.bilibili.com` | [Bilibili_diag_08_mitm_live.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_08_mitm_live.stoverride) |
| 09 | `line3-h5-mobile-api.biligame.com` | [Bilibili_diag_09_mitm_game.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_diag_09_mitm_game.stoverride) |

这些文件均不含广告处理，也不更改分流、DNS、证书或协议选项。单域名表示该文件只添加一个域名，不会删除基础配置或其他覆写中的解密列表、脚本和规则；若实际生效配置已经包含更广通配符，就不能把它当成真正的单域名实验。

- 某一份单独启用就卡：将该域名作为下一轮重点；查看同一时段的接口耗时、TLS handshake/EOF、HTTP/2、stream reset、timeout 等日志。错误类型只是候选证据，不能预先认定一定会出现。
- 五份单独都正常、04 仍卡：可能涉及多个域名共同启用、请求主机回退或连接并发；需要组合对照，不能认定单域名都没问题就已修好。
- 没有该域名请求：正常结果只能说明本次未复现，不能证明该连接兼容。

反馈只需“05 正常/卡，06 正常/卡”、Stash 和 B站版本，以及卡住时的域名、接口、错误类型和大致耗时。不要发送 Cookie、令牌或完整请求正文。证书方面先只读检查当前生效的 Stash CA 是否已在 iOS 完全信任，不要求删除或重新生成证书。当前主模块仍未通过这台手机的性能验收，日常使用可先保持停用。

## grpc 解密卡顿：可优化的边界

用户询问是否能优化 grpc 解密。已知对照仍是 05 卡、06 正常；05 本身无脚本，但它只添加 MitM 域名，不会关闭基础配置或其他覆写，因此还需区分纯连接兼容与解密后被其他配置接管。未取得该手机的 Stash 版本、“仅使用 Tunnel 代理”状态、有效 HTTP 配置及 gRPC 请求耗时，不能指定某个唯一原因。

Stash [HTTP 引擎文档](https://stash.wiki/http-engine/intro)说明解密后客户端/服务端连接独立协商 HTTP/2；[gRPC 官方协议](https://github.com/grpc/grpc/blob/master/doc/PROTOCOL-HTTP2.md)要求正确处理消息帧、trailer 和流结束。可检查 TLS 重试、HTTP/2 stream reset、响应体已到但 RPC 迟迟不结束、被触发的额外脚本及重放。它们都是候选机制，不能以页面卡顿确认其中任意一种，也不能默认把所有 `grpc-status` 改成成功。

优先的独立对照是：保持 05 无脚本条件，核对有效配置；固定同一网络/路由/视频，一次只改“仅使用 Tunnel 代理”的入站方式，再对照受影响域名当前路由与 DIRECT（需确认用户网络能直连）。每次完全退出 App 并重连，避免复用旧连接。若请求根本没有经过目标解密，该轮“正常”无效；不能为获取结果无限放宽解密或直接阻断 UDP。版本对照需先取得实际版本，再核对相关发布说明，不保证更新可修复。

当前 Stash 的公开 [MitM 配置](https://stash.wiki/http-engine/mitm)按域名/端口，脚本正则按 URL；因此仅给广告写精确脚本并不能让同域名的评论/弹幕免于 TLS 解密，也没有可据文档实现的“等页面加载好再解密广告接口”模式。协议级失败若持续，覆写 JS 无法修改 Stash 内部 HTTP/2 栈；实际选项是保留 grpc 直通、由引擎修复兼容性或使用该链路已验证兼容的其他客户端。当前日常版继续保持 grpc 直通，未发布猜测性头部/ALPN 修复。

## 当前源码能确认的等待

preview.6 已没有 `DmSegMobile` 请求/响应 hook，因此当前卡顿不能仅凭表现继续归因于之前的弹幕查询等待；这也不能证明播放器资源或空降独立任务一定没有影响。

01 中详情和评论仍使用 Loon 兼容转发 `tt → Wt`：从 grpc 主机开始时最多尝试 grpc→app 两站，每站客户端超时 3 秒，hook 上限 10 秒。两站失败后原请求继续，所以“约 6 秒”不是用户界面总等待的上界。

01/02 中 protobuf 响应仍有 `require-body:true`、4 MiB 正文上限和 3 秒执行上限；直播 JSON 为 2 MiB。完整响应缓冲、脚本启动、解析和内存占用都还存在。这些数字是配置上限，不是测得的手机耗时。03 保留的原生 jq 等也不是零处理。

## 不干扰其他配置的边界

01–04 保留相同的 MitM 列表，05–09 各自只添加一个域名，不使用全局 `#!replace` 清空用户规则，也不改变节点/策略组。由于 Stash 覆写默认会合并数组，**启用一个“更精简”的模块不能关闭另一个仍启用模块的脚本**；互斥使用是本实验成立的前提。

测试结束后停用诊断版。需要恢复主模块时也只开主模块，不与诊断、直通或可选评论版并用。日志反馈只需接口名、错误类型和大致耗时，不需要请求头、Cookie、令牌或正文。

依据：[Stash 覆写合并语义](https://stash.wiki/configuration/override)、[HTTP 引擎与解密](https://stash.wiki/http-engine/intro)、[脚本正文与超时参数](https://stash.wiki/script/rewrite-requests)。离线检查只验证分档边界和文件一致性，不能代替设备上的阶段反馈。
