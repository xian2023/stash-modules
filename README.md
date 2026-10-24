# Stash Modules

供 iPhone Stash 远程导入的模块。当前提供 Bilibili 去广告与空降助手，基于 Kelee 2026-10-02 规则和 kokoryh/Sparkle 脚本适配。

**当前版本：2026.10.24-preview.2。默认跳过评论接口，空降保留。** 已通过离线模拟测试，尚未完成 iPhone 真机的速度和自动跳转验收。

## 导入

在 Stash 的覆写管理中，通过 URL 添加下面的主模块：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_remove_ads.stoverride
```

关闭以前导入的 B站去广告覆写，包括旧的本地预览模块；开启 HTTPS 解密并完全信任 Stash CA 证书，随后完全退出 Bilibili 再打开。

主模块约 13 KiB，脚本单独下载并缓存，避免把大量 JS 内嵌在覆写配置里。模块及脚本均使用 HTTPS。新脚本使用内容版本目录和新的 provider 名称，以免更新配置后混用旧缓存。

## 评论加载慢

本版默认不匹配评论的 MainList / DetailList / DialogList 接口：不启动评论 JS，不复制评论正文，不重新请求评论，也不为评论查询第三方服务器。评论置顶推广可能重新显示。

这是针对脚本处理开销的调整，不是已确定手机卡顿根因。主模块仍需对 B站相关主机进行 HTTPS 解密；如果停用旧模块、只启用主模块后仍慢，还需要结合 Stash/Bilibili 版本、耗时日志及原配置分流检查。

只有需要评论区去广告时，再单独添加下面的**可选模块**：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/Bilibili_comments_optional.stoverride
```

可选模块仅处理 MainList 响应，限正文 1 MiB、执行 1 秒，不重发评论请求。它会增加正文等待和脚本执行开销；加载慢时先停用此模块。

## 远程更新

在 Stash 中刷新远程覆写，可获取仓库 `main` 分支上的新配置。脚本 provider 设置 `interval: 86400`，由 Stash 定期检查脚本；改动脚本后，新配置会引用新的内容版本目录。GitHub Raw 缓存可能导致更新短暂延迟。

请保留上面这两个固定地址，日后修复继续更新同一地址。仓库没有后台自动追踪上游代码，也不会自动给现有对话发送消息。

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

离线测试覆盖 YAML/jq、评论接口默认直通、远程文件哈希、gzip/gRPC、空降标记、缓存损坏、超时回退及未知字段保留。测试使用合成请求，不代表手机 HTTP/2 转发、播放器兼容、实际跳转和耗电已验证。GitHub Actions 在每次推送及 PR 时运行相同检查，不自动发布未测试的上游更新。

请勿手动覆盖已有的内容版本脚本。修改 `src/` 或构建逻辑并执行 `npm test`，将新模块及新目录在同一次提交中发布。

## 来源与许可

- [Kelee 原插件](https://kelee.one/Tool/Loon/Lpx/Bilibili_remove_ads.lpx)
- [kokoryh/Sparkle](https://github.com/kokoryh/Sparkle)：原 JS/protobuf 逻辑，GPL-3.0。
- [kokoryh/chronos](https://github.com/kokoryh/chronos)：播放器资源，远程引用。
- [Stash 脚本管理](https://stash.wiki/script/manage-script)、[HTTP 改写](https://stash.wiki/script/rewrite-requests)、[覆写配置](https://stash.wiki/configuration/override)。官方提醒复杂 `payload` 会增加配置解析开销。
- fflate：Arjun Barrett，MIT；见 `licenses/fflate.LICENSE`。

本地适配修改于 2026-10-24，按 GPL-3.0 发布，见 [LICENSE](LICENSE)。本仓库是第三方适配，不代表原作者背书；上游个人页面中的会员样式字段不代表获得服务端会员权益。
