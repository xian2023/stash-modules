# Stash Modules

供 iPhone Stash 远程导入的模块。提供 Bilibili 去广告与空降助手，以及独立的 X/Twitter 时间线去广告。

## X / Twitter 去广告

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/X_remove_ads.stoverride
```

在 Stash 覆写中单独导入，可与 Bilibili 模块同时启用。当前为 `2026.10.24-preview.1`：针对首页、推文详情/回复、搜索等 JSON 时间线中的明确推广标记；保留正常推文、图片/视频和分页游标，不额外请求服务器。需要开启并信任 HTTPS 解密，停用其他处理相同 X 接口的脚本。

模块约 1.4 KiB、脚本约 6 KiB。尚未 iPhone/X 真机验证，不能保证移除全部广告；详见 [范围、性能与兼容说明](docs/X_AD_FILTER.md)。

## Bilibili 去广告与空降

基于 Kelee 2026-10-02 规则和 kokoryh/Sparkle 脚本适配。

**当前版本：2026.10.24-preview.4。保留 Loon 一级评论兼容链，并补充楼中楼请求的传输兼容，空降保留。** 已通过离线模拟测试，尚未完成 iPhone 真机的速度和自动跳转验收。

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

Stash 的响应改写必须在响应交给 App 前完成，`$done` 结束脚本，结束后的定时器会取消；不能通过同一次请求先显示评论、之后再改写已显示内容。本版没有引入队列或后台 cron，也没有以牺牲首次空降换取等待减少。

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_passthrough.stoverride
```

以上是保留的**评论直通对照版**，与主模块只选一个，用于判断请求兼容链路是否影响当前设备。它不执行评论 JS，不转发评论请求；并不绕过所在域名的 HTTPS 解密。`Bilibili_comments_optional.stoverride` 仅供该对照版额外过滤 MainList 响应，主模块已包含评论处理，不应重复启用。

Loon 的脚本客户端明确设置 `alpn=h2` 并可读取 `h2_trailers`；Stash 官方接口没有承诺这两个选项。当前只做已公开 API 的适配，保留可见错误状态，不能声称已经复制了真实 HTTP/2 连接行为。详见 [Loon 兼容说明](docs/LOON_COMPATIBILITY.md)。若本版仍慢，需要真实的 Stash/Bilibili 版本与请求耗时，不能仅凭代码推断根因。

## 远程更新

在 Stash 中刷新远程覆写，可获取仓库 `main` 分支上的新配置。脚本 provider 设置 `interval: 86400`，由 Stash 定期检查脚本；改动脚本后，新配置会引用新的内容版本目录。GitHub Raw 缓存可能导致更新短暂延迟。

请保留需要的固定地址，日后修复继续更新同一地址。仓库没有后台自动追踪上游代码，也不会自动给现有对话发送消息。

## 空降助手

- 默认启用，保留弹幕注入及 ViewProgress 播放器资源改写。
- 使用 `bsbsb.top` 的片段数据和 `kokoryh/chronos` 播放器资源；无标注视频不会跳过。
- BV+CID 缓存有效片段 6 小时、无片段 10 分钟、错误 60 秒；最多 64 条。
- 服务超时 1 秒，另设 1.2 秒保护；失败后暂停新查询 30 秒。仅有有效片段才转发弹幕请求，转发失败时回退原始请求。
- 新视频首次查数据仍可能增加等待；空降与评论没有接口依赖，但手机运行资源和网络仍可能相互影响。
- `bsbsb.top` 和 GitHub Raw 沿用基础配置的分流，没有强行引用名为 `PROXY` 的策略组。

## 源码与验证

`src/` 为本地适配层；`upstream/` 保存用于构建的原始脚本与 jq。`scripts/build.mjs` 构建自包含/本地调试版本和远程发布版本。`modules/manifest.json` 记录当前发布脚本的 SHA-256。`scripts/bilibili/<内容版本>/` 内的运行脚本按版本保留，便于已有订阅继续引用。

需要 Node.js 22+、npm 及 jq：

```sh
npm ci
npm test
```

离线测试覆盖 YAML/jq、Loon 评论请求转发与备用主机、楼中楼正文与 gzip 字节保留、对照版评论直通、远程文件哈希、gzip/gRPC、真实错误状态保留、空降标记、缓存损坏、超时回退及未知字段保留。测试使用合成请求，不代表手机 HTTP/2 转发、播放器兼容、实际跳转和耗电已验证。GitHub Actions 在每次推送及 PR 时运行相同检查，不自动发布未测试的上游更新。

请勿手动覆盖已有的内容版本脚本。修改 `src/` 或构建逻辑并执行 `npm test`，将新模块及新目录在同一次提交中发布。

## 来源与许可

- [Kelee 原插件](https://kelee.one/Tool/Loon/Lpx/Bilibili_remove_ads.lpx)
- [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle)：原 JS/protobuf 逻辑，GPL-3.0。
- [kokoryh/chronos](https://github.com/kokoryh/chronos)：播放器资源，远程引用。
- [Stash 脚本管理](https://stash.wiki/script/manage-script)、[HTTP 改写](https://stash.wiki/script/rewrite-requests)、[覆写配置](https://stash.wiki/configuration/override)。官方提醒复杂 `payload` 会增加配置解析开销。
- fflate：Arjun Barrett，MIT；见 `licenses/fflate.LICENSE`。

本地适配修改于 2026-10-24，按 GPL-3.0 发布，见 [LICENSE](LICENSE)。本仓库是第三方适配，不代表原作者背书；上游个人页面中的会员样式字段不代表获得服务端会员权益。
