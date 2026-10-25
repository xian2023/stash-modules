# Stash Modules

供 iPhone Stash 远程导入的模块。提供 Bilibili 去广告与空降助手，以及可选的 X 网页版去广告预览。

## X / Twitter 去广告

**原生 App 适配已暂停。真机确认：不运行任何脚本、只开启 HTTPS 解密的诊断版也无法刷新，日志为 `TLS handshake error from api.twitter.com:443: EOF`。旧去广告和诊断地址已更新为停用版，不再添加任何网络配置。请停用两个旧版并重连 Stash；这不是原生去广告已修好。Bilibili 模块不受本次变更影响。**

可选的 **Safari / PWA 网页版**预览使用独立地址：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/X_Web_remove_ads.stoverride
```

当前为 `2026.10.24-web-preview.1`，仅匹配 `x.com/i/api/graphql/` 下的首页、关注和推文详情三个操作，只添加 `x.com` 解密，不包含原生 API 域名。不能去除原生 App 广告；这是可选方案，无需为继续使用原生 App 而启用它。

保留普通推文、媒体与分页，不额外请求服务器。网页版仍未在本机完成真机验证；若影响加载请停用。详见 [范围、性能与兼容说明](docs/X_AD_FILTER.md)。

## Bilibili 去广告与空降

基于 Kelee 2026-10-02 规则和 kokoryh/Sparkle 脚本适配。

**当前版本：2026.10.25-preview.5。弹幕先走 App 原始请求，响应阶段再做限时空降注入；移除弹幕脚本转发，保留一级评论和楼中楼兼容链。** 已通过离线模拟测试，尚未完成本版 iPhone 速度和自动跳转验收。

## 导入

在 Stash 的覆写管理中，通过 URL 添加下面的主模块：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_remove_ads.stoverride
```

关闭以前导入的 B站去广告覆写，包括旧的本地预览模块和「评论去广告 · 可选」；只启用本主模块。开启 HTTPS 解密并完全信任 Stash CA 证书，随后完全退出 Bilibili 再打开。已订阅同一地址时，刷新覆写并确认版本为 `2026.10.24-preview.4`。

主模块约 13 KiB，脚本单独下载并缓存，避免把大量 JS 内嵌在覆写配置里。模块及脚本均使用 HTTPS。新脚本使用内容版本目录和新的 provider 名称，以免更新配置后混用旧缓存。

## 评论加载慢

Loon 原插件的 `optimizeRequest=true` 默认启用：它对评论 MainList 和视频详情 View 发起脚本请求，原主机失败时尝试备用主机，然后按原作者的 protobuf 逻辑处理并返回。此前 preview.2 将评论直通当作降低开销的方案，省略了这条传输兼容链路，与原 Loon 默认行为不等价。

本版恢复原主机顺序、每站 3 秒、总 hook 10 秒，以及 gRPC 状态适配。评论请求不查询空降服务器。成功时返回脚本得到的响应，不再发送原始请求；两站失败或格式不支持时继续原始请求。失败路径仍可能增加等待，不能把恢复逻辑当作保证加速。

preview.4 另外对楼中楼的 `DetailList` 和对话树的 `DialogList` 使用相同的请求转发与状态兼容。这是对原 Loon 路由的本地扩展。两个接口的响应正文逐字节保留，不解压、不用 MainList 格式解析或过滤，也不执行第二次响应脚本；主机回退和失败放行策略不变。

Stash 的响应改写必须在响应交给 App 前完成，`$done` 结束脚本，结束后的定时器会取消；不能通过同一次请求先显示内容、之后再改写已显示数据。preview.5 把空降查询移到收到官方弹幕响应之后，只等待约 250 ms 保护时间；它不是后台任务，慢服务可能导致本次空降跳过，以优先放行普通弹幕。没有证明手机上全部卡顿已消除。

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_passthrough.stoverride
```

以上是保留的**评论直通对照版**，与主模块只选一个，用于判断请求兼容链路是否影响当前设备。它不执行评论 JS，不转发评论请求；并不绕过所在域名的 HTTPS 解密。`Bilibili_comments_optional.stoverride` 仅供该对照版额外过滤 MainList 响应，主模块已包含评论处理，不应重复启用。

Loon 的脚本客户端明确设置 `alpn=h2` 并可读取 `h2_trailers`；Stash 官方接口没有承诺这两个选项。当前只做已公开 API 的适配，保留可见错误状态，不能声称已经复制了真实 HTTP/2 连接行为。详见 [Loon 兼容说明](docs/LOON_COMPATIBILITY.md)。若本版仍慢，需要真实的 Stash/Bilibili 版本与请求耗时，不能仅凭代码推断根因。

## 远程更新

在 Stash 中刷新远程覆写，可获取仓库 `main` 分支上的新配置。脚本 provider 设置 `interval: 86400`，由 Stash 定期检查脚本；改动脚本后，新配置会引用新的内容版本目录。GitHub Raw 缓存可能导致更新短暂延迟。

请保留需要的固定地址，日后修复继续更新同一地址。仓库没有后台自动追踪上游代码，也不会自动给现有对话发送消息。

## 空降助手

- 默认启用，保留弹幕注入及 ViewProgress 播放器资源改写；preview.5 改为使用 App 已收到的弹幕响应，不再由脚本请求一遍官方弹幕。
- 使用 `bsbsb.top` 的片段数据和 `kokoryh/chronos` 播放器资源；无标注视频不会跳过。
- BV+CID 缓存有效片段 6 小时、无片段 10 分钟、错误 60 秒；最多 64 条。
- 弹幕请求阶段不访问网络、不等待空降数据，只增加逐请求上下文头；正文、URL 和原有业务请求头保留。响应阶段命中缓存不联网，未命中时客户端超时为 0.2 秒，另有 250 ms 保护；失败后暂停新查询 30 秒。保护限的是脚本等待，不能保证取消宿主未结束的网络请求。
- 空降服务慢于限时可能跳过本次空降并错误缓存 60 秒，优先正常加载。并发响应遇到活动查询租约立即放行；存储非原子，租约只是尽力减少重复查询。没有片段或当前弹幕包无对应触发点时不解压/解析 protobuf。
- 上下文头 `x-stash-bili-airborne-context` 含原弹幕正文已有的 aid、CID、分包序号，用于匹配同一请求的响应，随原请求发给 Bilibili；不保存“最后视频”全局变量，避免串集。缺失/无效则不注入，Stash 的实际头传递和服务端兼容仍需真机验证。
- 触发点按实际注入进度（起点加 2 秒）落入对应 6 分钟弹幕包，避免跨包重复或提前触发。
- `bsbsb.top` 和 GitHub Raw 沿用基础配置的分流，没有强行引用名为 `PROXY` 的策略组。

## 源码与验证

`src/` 为本地适配层；`upstream/` 保存用于构建的原始脚本与 jq。`scripts/build.mjs` 构建自包含/本地调试版本和远程发布版本。`modules/manifest.json` 记录当前发布脚本的 SHA-256。`scripts/bilibili/<内容版本>/` 内的运行脚本按版本保留，便于已有订阅继续引用。

需要 Node.js 22+、npm 及 jq：

```sh
npm ci
npm test
```

离线测试覆盖 YAML/jq、Loon 评论请求转发与备用主机、楼中楼正文与 gzip 字节保留、对照版评论直通、远程文件哈希、gzip/gRPC、真实错误状态保留、空降标记、缓存损坏、服务挂起与晚回调、并发弹幕及评论、弹幕分包边界、原响应保留及未知字段保留。测试使用合成请求，不代表手机 HTTP/2 转发、播放器兼容、实际跳转和耗电已验证。GitHub Actions 在每次推送及 PR 时运行相同检查，不自动发布未测试的上游更新。

请勿手动覆盖已有的内容版本脚本。修改 `src/` 或构建逻辑并执行 `npm test`，将新模块及新目录在同一次提交中发布。

## 来源与许可

- [Kelee 原插件](https://kelee.one/Tool/Loon/Lpx/Bilibili_remove_ads.lpx)
- [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle)：原 JS/protobuf 逻辑，GPL-3.0。
- [kokoryh/chronos](https://github.com/kokoryh/chronos)：播放器资源，远程引用。
- [Stash 脚本管理](https://stash.wiki/script/manage-script)、[HTTP 改写](https://stash.wiki/script/rewrite-requests)、[覆写配置](https://stash.wiki/configuration/override)。官方提醒复杂 `payload` 会增加配置解析开销。
- fflate：Arjun Barrett，MIT；见 `licenses/fflate.LICENSE`。

本地适配修改于 2026-10-25，按 GPL-3.0 发布，见 [LICENSE](LICENSE)。本仓库是第三方适配，不代表原作者背书；上游个人页面中的会员样式字段不代表获得服务端会员权益。
