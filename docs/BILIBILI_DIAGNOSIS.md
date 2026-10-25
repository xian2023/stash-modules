# B站卡顿：互斥分阶段定位

目标是找出哪一组处理与当前手机的卡顿有关，而不是继续假定空降服务是唯一原因。主模块暂保持 `2026.10.25-preview.6` 原样；本页对照模块为 `2026.10.25-diag.1`，由同一版本自动构建。源版本及文件哈希在 `modules/Bilibili_diagnostics.manifest.json`。

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

## 当前源码能确认的等待

preview.6 已没有 `DmSegMobile` 请求/响应 hook，因此当前卡顿不能仅凭表现继续归因于之前的弹幕查询等待；这也不能证明播放器资源或空降独立任务一定没有影响。

01 中详情和评论仍使用 Loon 兼容转发 `tt → Wt`：从 grpc 主机开始时最多尝试 grpc→app 两站，每站客户端超时 3 秒，hook 上限 10 秒。两站失败后原请求继续，所以“约 6 秒”不是用户界面总等待的上界。

01/02 中 protobuf 响应仍有 `require-body:true`、4 MiB 正文上限和 3 秒执行上限；直播 JSON 为 2 MiB。完整响应缓冲、脚本启动、解析和内存占用都还存在。这些数字是配置上限，不是测得的手机耗时。03 保留的原生 jq 等也不是零处理。

## 不干扰其他配置的边界

每份对照都保留相同的 MitM 列表，不使用全局 `#!replace` 清空用户规则，也不改变节点/策略组。由于 Stash 覆写默认会合并数组，**启用一个“更精简”的模块不能关闭另一个仍启用模块的脚本**；互斥使用是本实验成立的前提。

测试结束后停用诊断版。需要恢复主模块时也只开主模块，不与诊断、直通或可选评论版并用。日志反馈只需接口名、错误类型和大致耗时，不需要请求头、Cookie、令牌或正文。

依据：[Stash 覆写合并语义](https://stash.wiki/configuration/override)、[HTTP 引擎与解密](https://stash.wiki/http-engine/intro)、[脚本正文与超时参数](https://stash.wiki/script/rewrite-requests)。离线检查只验证分档边界和文件一致性，不能代替设备上的阶段反馈。
