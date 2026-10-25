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

**当前真机反馈：全关正常，01–04 均卡，05（仅解密 grpc）卡，06（仅解密 app）正常。已优先避开 grpc 解密，不能直接归因广告回包或空降等待，具体连接原因仍未确认。**

**用户已反馈 app 域名精简版使用正常，当前建议继续使用这一份，作为后续功能加回的基线。** 该反馈确认本轮加载表现，不代表所有广告形态已验证。

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_app_compat.stoverride
```

版本 `2026.10.25-app-preview.1`，只添加 `app.bilibili.com` 解密，保留开屏列表响应及开屏、首页、竖屏推荐的原生过滤。没有 JS、请求转发、评论/弹幕处理或空降；走 grpc 及其他域名的广告会保留。仅对匹配接口有效，不保证覆盖所有首页广告。用户已反馈此版正常；具体广告覆盖率尚未单独验收。[定位过程与使用边界](docs/BILIBILI_DIAGNOSIS.md)。

**关闭主模块、01–09、评论直通/可选版及其他 B站覆写，只开这一份；完全退出 B站，重连 Stash 后再打开。** 它不会移除基础配置或其他覆写的解密域名，仍需确认没有其他来源开启 grpc 解密。

### 完整兼容测试：一次恢复，再按需二分

测试 01 的用户反馈是“视频下面有广告横幅，其他正常”。按用户最新要求，不再逐项等待，改为一次恢复完整功能组的独立测试：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_compat_full_test.stoverride
```

版本 `2026.10.25-compat-full-test.1`，恢复视频详情/相关推荐、评论响应、直播、原生过滤和延后空降。继续排除已复现卡顿的 grpc 解密，不重放原请求；本次还加入 api、直播、游戏三个域名解密，其手机兼容性尚未单独验证。完整包保留上游标签页/我的页面净化及播放响应调整，详见 [完整测试与二分方案](docs/BILIBILI_DIAGNOSIS.md)。

**停用精简版、测试 01、原主模块和其他 B站覆写，只开完整兼容测试，划掉 B站、重连 Stash 后重开。** 原精简版、测试 01 和原主模块文件均不改动。若卡顿先切回原精简版，再用独立替代文件按功能组二分。

实际走 grpc 的请求仍直通，对应广告可能保留。空降需 ViewProgress 走 app 域名并成功加载播放器资源；当前不是“全部广告保证去除”的真机验收版本。

当前用户反馈完整兼容测试其他表现正常，但视频下方下载横幅和相关推荐里的广告卡仍在。尚未确认请求来源；需要临时诊断时使用独立地址：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_banner_diagnostic.stoverride
```

当前为 `2026.10.25-banner-diag.2`，改为 **B站播放器画面内的原生短提示**，无需搜索 Stash 日志，也不发系统通知。刷新原诊断地址后，只开这一份，划掉 B站并重连；打开视频，观察“播放器已载入”及随后约 4 秒、20 秒的摘要提示。**原生资源未加载时无法显示，完全没有提示也请直接反馈，不能等同于接口未命中。** 保留原广告过滤和解密域名；额外资源约 1 MiB，首次可能下载。诊断结束切回完整兼容版。[提示说明与解释边界](docs/BILIBILI_DIAGNOSIS.md)。

### 保留对照：独立功能测试 01

此前测试 01 仅恢复 **app 域名的热门、动态、搜索响应过滤**，地址保留作对照：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_app_test_01_feed.stoverride
```

版本 `2026.10.25-app-test.1`，是精简版的完整替代测试配置。先停用精简版、主模块及其他 B站覆写，只启用测试 01；划掉 B站、重连 Stash 后再打开。它保留精简版全部原生过滤，只新增三个接口的一份响应脚本，继续只解密 app 域名；评论、弹幕、视频详情、播放器、请求转发及空降均不启用。**精简版的内容和地址保持不变，可以随时切回。**

先看热门、动态、搜索页面加载，再打开同一视频检查播放、弹幕、一级评论及楼中楼是否仍正常。仅在请求实际走 app 域名时新增过滤才会命中；若仍走 grpc，不会被重定向或过滤。[测试范围与结果反馈](docs/BILIBILI_DIAGNOSIS.md)。

基于 Kelee 2026-10-02 规则和 kokoryh/Sparkle 脚本适配。

**原完整实验版：2026.10.25-preview.6。普通版 iPhone B站的播放器延后空降预览：分包弹幕完全不挂脚本，播放稳定推进约 8 秒后独立查询，中插广告由播放器检查进度后跳过。** 这不是“全部资源加载完成”事件，也不代表已通过真机验收；一级评论和楼中楼兼容链保留。

## 原完整预览版导入

原主模块保留作开发对照，包含已在该设备复现卡顿的 grpc 解密，当前不作为流畅方案。若需要原完整功能，其地址如下：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_remove_ads.stoverride
```

关闭以前导入的 B站去广告覆写，包括旧的本地预览模块和「评论去广告 · 可选」；只启用本主模块。开启 HTTPS 解密并完全信任 Stash CA 证书，随后完全退出 Bilibili 再打开。已订阅同一地址时，刷新覆写并确认版本为 `2026.10.25-preview.6`。

主模块约 13 KiB，脚本单独下载并缓存，避免把大量 JS 内嵌在覆写配置里。模块及脚本均使用 HTTPS。新脚本使用内容版本目录和新的 provider 名称，以免更新配置后混用旧缓存。

## 评论加载慢

Loon 原插件的 `optimizeRequest=true` 默认启用：它对评论 MainList 和视频详情 View 发起脚本请求，原主机失败时尝试备用主机，然后按原作者的 protobuf 逻辑处理并返回。此前 preview.2 将评论直通当作降低开销的方案，省略了这条传输兼容链路，与原 Loon 默认行为不等价。

本版恢复原主机顺序、每站 3 秒、总 hook 10 秒，以及 gRPC 状态适配。评论请求不查询空降服务器。成功时返回脚本得到的响应，不再发送原始请求；两站失败或格式不支持时继续原始请求。失败路径仍可能增加等待，不能把恢复逻辑当作保证加速。

preview.4 另外对楼中楼的 `DetailList` 和对话树的 `DialogList` 使用相同的请求转发与状态兼容。这是对原 Loon 路由的本地扩展。两个接口的响应正文逐字节保留，不解压、不用 MainList 格式解析或过滤，也不执行第二次响应脚本；主机回退和失败放行策略不变。

preview.6 已从弹幕分包请求和响应上移除全部脚本及空降等待。独立查询由修改过的普通版 Chronos 播放器资源在开始播放后发起；不在 `$done` 之后偷偷继续运行定时器，也不修改已交付的弹幕。评论兼容链未改动。详见 [延后空降机制与边界](docs/DEFERRED_AIRBORNE.md)。

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_passthrough.stoverride
```

以上是保留的**评论直通对照版**，与主模块只选一个，用于判断请求兼容链路是否影响当前设备。它不执行评论 JS，不转发评论请求；并不绕过所在域名的 HTTPS 解密。`Bilibili_comments_optional.stoverride` 仅供该对照版额外过滤 MainList 响应，主模块已包含评论处理，不应重复启用。

Loon 的脚本客户端明确设置 `alpn=h2` 并可读取 `h2_trailers`；Stash 官方接口没有承诺这两个选项。当前只做已公开 API 的适配，保留可见错误状态，不能声称已经复制了真实 HTTP/2 连接行为。详见 [Loon 兼容说明](docs/LOON_COMPATIBILITY.md)。若本版仍慢，需要真实的 Stash/Bilibili 版本与请求耗时，不能仅凭代码推断根因。

## 远程更新

在 Stash 中刷新远程覆写，可获取仓库 `main` 分支上的新配置。脚本 provider 设置 `interval: 86400`，由 Stash 定期检查脚本；改动脚本后，新配置会引用新的内容版本目录。GitHub Raw 缓存可能导致更新短暂延迟。

请保留需要的固定地址，日后修复继续更新同一地址。仓库没有后台自动追踪上游代码，也不会自动给现有对话发送消息。

## 空降助手

- preview.6 只对已核对的普通版 iPhone 播放器资源启用延后查询，HD/国际版不在本次验收范围。
- 先正常播放，播放进度连续推进约 8 秒后，播放器才发出独立异步请求；暂停、后台、拖动进度会影响触发时机。这是延后启发式条件，不知道评论或全部资源是否已加载完成。
- 一次获取本视频已标注的广告时间段，随后持续检查进度：进入广告段约 2 秒后跳至段末；数据晚到但还在段内可以补跳，整段已播完则不回退。手动拖回已跳过片段不会反复强跳。
- 切换 aid/CID 立刻作废旧结果；当前已暂停或退到后台时不跳。查询失败则继续播放，本次访问不反复重试，因此不能保证每段广告都跳过。
- `DmSegMobile` 请求/响应完全没有 JS hook、没有上下文头、没有数据缓冲/空降查询；只在播放器自己发起的合成端点中执行空降工作。该独立工作仍使用 Stash 的网络设施，不能保证手机底层资源绝不竞争。
- 合成端点 `api.bilibili.com/x/stash-airborne/segments` 在 Stash 内直接回应，正常不会请求到 Bilibili 服务器；请求只含视频 aid/CID，访问空降服务不转发 Cookie/Authorization。
- 独立缓存 `bili.stash.sponsor.v2`：有效片段 6 小时、无片段 10 分钟、失败 60 秒，最多 64 条；客户端服务超时 1 秒、保护 1.2 秒，均不放在弹幕响应交付链里。
- 修改的 Chronos ZIP 按实际内容 MD5 校验，保留原始资源并记录来源哈希。首次更新需要下载约 1 MiB 播放器资源，原生包加载、网络桥接与跳转仍需真机验证。
- 时间段来自 `bsbsb.top`，未标注视频及平台单独插入、不在视频时间轴上的广告不属于这套空降机制。

## 源码与验证

`src/` 为本地适配层；`upstream/` 保存用于构建的原始脚本与 jq。`scripts/build.mjs` 构建自包含/本地调试版本和远程发布版本，并通过 `scripts/build-chronos.mjs` 重建修改的播放器资源。`modules/manifest.json` 记录当前发布脚本的 SHA-256。`scripts/bilibili/<内容版本>/` 内的运行脚本按版本保留，便于已有订阅继续引用。

需要 Node.js 22+、npm 及 jq：

```sh
npm ci
npm test
```

离线测试覆盖 YAML/jq、Loon 评论请求转发与备用主机、楼中楼正文与 gzip 字节保留、对照版评论直通、远程文件哈希、gzip/gRPC、真实错误状态保留、空降标记、缓存损坏、独立服务超时和晚回调、播放延后、中插、暂停/切换/手动拖回、ZIP 重建和原生桥接合约模拟。测试使用合成请求，不代表手机 HTTP/2 转发、播放器兼容、实际跳转和耗电已验证。GitHub Actions 在每次推送及 PR 时运行相同检查，不自动发布未测试的上游更新。

请勿手动覆盖已有的内容版本脚本。修改 `src/` 或构建逻辑并执行 `npm test`，将新模块及新目录在同一次提交中发布。

## 来源与许可

- [Kelee 原插件](https://kelee.one/Tool/Loon/Lpx/Bilibili_remove_ads.lpx)
- [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle)：原 JS/protobuf 逻辑，GPL-3.0。
- [kokoryh/chronos](https://github.com/kokoryh/chronos)：播放器资源，远程引用。
- [Stash 脚本管理](https://stash.wiki/script/manage-script)、[HTTP 改写](https://stash.wiki/script/rewrite-requests)、[覆写配置](https://stash.wiki/configuration/override)。官方提醒复杂 `payload` 会增加配置解析开销。
- fflate：Arjun Barrett，MIT；见 `licenses/fflate.LICENSE`。

本地适配修改于 2026-10-25，按 GPL-3.0 发布，见 [LICENSE](LICENSE)。本仓库是第三方适配，不代表原作者背书；上游个人页面中的会员样式字段不代表获得服务端会员权益。
