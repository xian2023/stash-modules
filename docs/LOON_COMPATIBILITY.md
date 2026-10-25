# Loon 评论链路与 Stash 适配

## preview.6 播放器延后查询

当前版本 `2026.10.25-preview.6` 不再为 `DmSegMobile` 注册任何请求或响应脚本。普通版播放器稳定推进约 8 秒后独立查询空降时间段，并在中插发生时按当前播放位置跳转；不依赖已交付弹幕被再次改写。原有评论传输兼容链保留。实现、资源来源与原生验证限制见 [延后空降说明](DEFERRED_AIRBORNE.md)。

## preview.5 弹幕等待隔离（历史）

历史版本 `2026.10.25-preview.5` 的行为如下，已被 preview.6 的播放器方案替换。以下评论链保持 preview.4 的实现；仅弹幕空降处理改为请求/响应两阶段。用户反馈弹幕卡住之后评论也慢，代码检查发现 preview.4 弹幕先等待空降服务（最多约 1.2 秒），有片段时再用 `Wt(context,1)` 等待一次官方弹幕转发（客户端超时 3 秒）。评论代码没有直接等待弹幕的依赖，不能从此推断手机运行时的全部根因。

preview.5 请求阶段只解析原始弹幕请求并加 `x-stash-bili-airborne-context`，不调用 HTTP、不转发弹幕。该头包含正文已有的 aid、CID、分包序号，随请求传给服务端，在匹配的响应阶段读取；不依赖未公开的响应脚本 `$request.body`，也不使用“最近视频”的全局关联。若头未被 Stash 保留，则不注入，原响应透传。头传递和服务端容忍仍需真机验证。

响应阶段使用 App 的原始弹幕数据：缓存命中不联网；否则服务调用 `timeout:0.2` 秒，并用 250 ms 定时器限制等待。保护时间不包含脚本启动、正文缓冲或调度，也不保证取消宿主仍在进行的 HTTP。未及时取得片段时返回 `$done({})`，慢服务会降低首次空降成功率（错误缓存 60 秒、全局失败熔断 30 秒），以优先放行普通弹幕。

并发响应遇到尚有效的服务租约直接放行，不排队等待。持久存储读写不是原子操作，无法保证手机上绝对只有一个服务请求。晚回调被 settled 标志丢弃；旧失败不覆盖新写入的有效片段。无匹配片段时不解压和解码普通弹幕；修改时沿用原作者的 codec 和 `nn` 触发项，保留未知字段。按注入 `progress`（片段开始加 2 秒）选择对应 6 分钟包，并避免重复注入。

这是在响应交付 App 前做的限时处理，不是结束脚本后的后台工作。原有 ViewProgress chronos、MainList、DetailList 和 DialogList 逻辑不变；评论独立的主机回退仍可能增加等待。合成并发测试只能证明代码没有互相 await，不能证明 Stash 的真实调度或手机界面不再卡顿。

分包依据：[API 收集项目作者的弹幕说明](https://github.com/bilibili-plugins/bilibili-api-collect/blob/master/docs/danmaku/danmaku_proto.md)。这不是对当前设备流量的抓包证明。

## preview.4 评论兼容基线（当前继续保留）

依据：仓库 `upstream/Bilibili_remove_ads.loon-ua.lpx` 第 16、70、72 行及 `upstream/scripts/proto_request.js` 中的 `tt`、`Wt`、`v`、`Lt`、`lt`。原插件标注日期 2026-10-02。

| 行为 | 原 Loon 默认 | Stash preview.4 |
| --- | --- | --- |
| optimizeRequest | true | true |
| 请求路由 | Viewunite/View、Reply/MainList | 相同 |
| 楼中楼请求 | 原配置未为 DetailList/DialogList 注册请求脚本 | 本地扩展相同传输兼容；正文原样保留 |
| 原请求 method/body/业务 headers | 保留 | 保留 |
| 主机尝试 | 从 grpc 开始时 grpc→app；从 app 开始只尝试 app | 相同 |
| 每主机超时 | 3 秒，宿主参数 3000 毫秒 | 3 秒，宿主参数 3 |
| 请求 hook 总超时 | 10 秒 | 10 秒 |
| 评论净化 | 原作者 Lt protobuf 处理 | 保留同一函数 |
| 空降查询 | 独立 DmSegMobile 路由 | 与评论分开，不为评论查询 |
| 强制 HTTP/2 | Loon `$httpClient` 的 `alpn=h2` | Stash 文档未承诺该参数，不能保证等价 |
| HTTP/2 trailers | Loon 文档提供 `h2_trailers` | Stash 文档未承诺；仅适配宿主实际提供的值 |

原请求处理在成功后生成伪响应；不是在 App 已显示后再修改内容。恢复它的目的是对齐原版行为，不能据此保证弱网更快：当两个主机都失败时，原请求继续前可能已等待约 6 秒。

输出响应时显式保留状态/正文，并规范化 `grpc-status`、`grpc-message`、`grpc-status-details-bin`。优先采用可见 trailers，其次响应头；错误状态不改为成功。无可见状态且请求 moss engine 为 1 时，保留原作者补 `grpc-status:0` 的兼容策略，这不是对服务端成功状态的实际观测。

preview.2 的评论直通不等价于 Loon 原版的请求优化。preview.3 将其保留为独立 `Bilibili_passthrough.stoverride` 以供对照，不能和主模块叠加启用。

## 楼中楼扩展

[社区收集的 reply.proto 源码镜像](https://github.com/alittlehuaji/bilibili-api-collect-mirror/blob/master/grpc_api/bilibili/main/community/reply/v1/reply.proto) 将 `DetailList` 定义为二级评论明细、`DialogList` 定义为对话评论树。这是接口名称的源码依据，不是对当前手机请求的抓包证明。

preview.4 为这两个精确路径注册 `tt` 传输处理，不接入 `v` 的 protobuf 拆帧重编码，也不调用一级评论过滤函数 `Lt`。转发收到的 body 字节（包括 gzip 数据）原样返回，仅适配响应头和可见状态；两个主机都失败时放行原请求。不修改 root、rpid、分页游标或未知字段，也不拦截点赞、发评和删评等写入接口。

这修复了已确认的路由覆盖缺口。一级评论改善不能证明楼中楼是同一根因，真实加载速度仍需设备验证。

离线检查采用合成回调，确认代码路径、原始字节、主机顺序、超时单位、gzip 及未知字段保留；不验证 TLS/ALPN、真实 HTTP/2 trailers、内部 HTTP 请求是否重入脚本或手机界面速度。这些仍需客户端验证。

官方接口：[Loon Script API](https://nsloon.app/docs/Script/script_api/)、[Stash 脚本接口](https://stash.wiki/script/syntax-and-interface)、[Stash 响应改写](https://stash.wiki/script/rewrite-requests)。
