# Loon 评论链路与 Stash 适配

依据：仓库 `upstream/Bilibili_remove_ads.loon-ua.lpx` 第 16、70、72 行及 `upstream/scripts/proto_request.js` 中的 `tt`、`Wt`、`v`、`Lt`、`lt`。原插件标注日期 2026-10-02。

| 行为 | 原 Loon 默认 | Stash preview.3 |
| --- | --- | --- |
| optimizeRequest | true | true |
| 请求路由 | Viewunite/View、Reply/MainList | 相同 |
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

离线检查采用合成回调，确认代码路径、原始字节、主机顺序、超时单位、gzip 及未知字段保留；不验证 TLS/ALPN、真实 HTTP/2 trailers、内部 HTTP 请求是否重入脚本或手机界面速度。这些仍需客户端验证。

官方接口：[Loon Script API](https://nsloon.app/docs/Script/script_api/)、[Stash 脚本接口](https://stash.wiki/script/syntax-and-interface)、[Stash 响应改写](https://stash.wiki/script/rewrite-requests)。
