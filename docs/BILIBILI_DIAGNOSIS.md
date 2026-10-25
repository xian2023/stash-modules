# B站卡顿：互斥分阶段定位

目标是找出哪一组处理与当前手机的卡顿有关，而不是继续假定空降服务是唯一原因。主模块暂保持 `2026.10.25-preview.6` 原样；本页对照模块为 `2026.10.25-diag.2`，由同一版本自动构建。源版本及文件哈希在 `modules/Bilibili_diagnostics.manifest.json`。

## 最新结果：05 卡，06 正常

用户已确认：全关正常、01–04 均卡、05（只解密 `grpc.biliapi.net`）卡、06（只解密 `app.bilibili.com`）正常。这使 grpc 域名解密成为能单独复现的条件；尚未区分 TLS/HTTP 连接兼容与解密后触发其他有效配置，不能宣称已确认某个具体协议缺陷。07–09 未反馈，也不能视为已通过。

下一步停止扩大解密范围，在 06 的正常基线上加回小范围的原生去广告：[Bilibili_app_compat.stoverride](https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_app_compat.stoverride)，版本 `2026.10.25-app-preview.1`。它只解密 app 域名，包含开屏列表 mock、开屏 show/event、首页 feed 和竖屏 story 三条原生正文过滤。无 JS/provider、请求转发、域名拒绝、评论/弹幕处理和空降；不改写播放器资源，也不通过阻断、DNS 映射或 URL 改写强迫 grpc 请求转到 app。

**停用主模块、全部诊断版、评论直通/可选版和其他 B站覆写，只开此兼容预览，划掉 B站、重连 Stash 后重开。** 这是功能加回验证：06 正常不等于新增原生过滤也已通过真机验收。先检查同一视频的弹幕、一级评论与楼中楼，再看开屏/首页过滤是否命中。只反馈“精简版正常/卡；哪些广告仍出现”即可；若它卡而 06 正常，下一步拆分这三条过滤和开屏 mock，不重新打开 grpc。

走 grpc、api、直播或其他未解密域名的广告不会处理；新接口或其他形态的首页广告也可能保留，当前版本不具备完整原模块的覆盖率。基础配置及其他覆写中的 grpc 解密不会被此文件自动删除，必须保持与 06 对照相同的有效配置条件。原完整预览仍保留作开发对照，不作为该设备的流畅方案。

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

## 当前源码能确认的等待

preview.6 已没有 `DmSegMobile` 请求/响应 hook，因此当前卡顿不能仅凭表现继续归因于之前的弹幕查询等待；这也不能证明播放器资源或空降独立任务一定没有影响。

01 中详情和评论仍使用 Loon 兼容转发 `tt → Wt`：从 grpc 主机开始时最多尝试 grpc→app 两站，每站客户端超时 3 秒，hook 上限 10 秒。两站失败后原请求继续，所以“约 6 秒”不是用户界面总等待的上界。

01/02 中 protobuf 响应仍有 `require-body:true`、4 MiB 正文上限和 3 秒执行上限；直播 JSON 为 2 MiB。完整响应缓冲、脚本启动、解析和内存占用都还存在。这些数字是配置上限，不是测得的手机耗时。03 保留的原生 jq 等也不是零处理。

## 不干扰其他配置的边界

01–04 保留相同的 MitM 列表，05–09 各自只添加一个域名，不使用全局 `#!replace` 清空用户规则，也不改变节点/策略组。由于 Stash 覆写默认会合并数组，**启用一个“更精简”的模块不能关闭另一个仍启用模块的脚本**；互斥使用是本实验成立的前提。

测试结束后停用诊断版。需要恢复主模块时也只开主模块，不与诊断、直通或可选评论版并用。日志反馈只需接口名、错误类型和大致耗时，不需要请求头、Cookie、令牌或正文。

依据：[Stash 覆写合并语义](https://stash.wiki/configuration/override)、[HTTP 引擎与解密](https://stash.wiki/http-engine/intro)、[脚本正文与超时参数](https://stash.wiki/script/rewrite-requests)。离线检查只验证分档边界和文件一致性，不能代替设备上的阶段反馈。
