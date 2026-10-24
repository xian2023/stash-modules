# X/Twitter 模块状态与兼容性

## 原生 App：暂停适配，先恢复加载

本次真机反馈形成了明确的对照：

1. 开启原去广告模块后首页刷新失败，停用后恢复。
2. 停用去广告模块，改为只启用同域名、无脚本的诊断版，仍然失败。
3. 日志显示 `TLS handshake error from api.twitter.com:443: EOF`，并出现证书查询记录。

因此无需运行广告脚本即可触发故障，握手失败发生在 JSON 正文处理之前。`EOF` 表示连接结束；它本身不能进一步区分 App 的证书校验、Stash 的 TLS/HTTP 引擎兼容或其他握手问题，不能直接宣布已确认是证书锁定。后续排查需要 X / Stash 版本与对应握手错误。

**请停用或删除 `X_remove_ads` 和 `X_MITM_diagnostic` 两个旧版，重新连接 Stash，再完全退出并打开 X。不要为了原生去广告继续反复开启诊断版。Bilibili 模块可以保持启用。**

为避免远程用户继续导入故障配置，两个旧地址已更新为仅含名称、描述等展示字段的停用版：

- `X_remove_ads.stoverride`：`2026.10.24-preview.2`，无解密、脚本、provider、分流或拦截规则。
- `X_MITM_diagnostic.stoverride`：`2026.10.24-diag.2`，诊断结束，同样不添加网络配置。

这属于撤除故障功能，不代表原生 App 去广告已修复。远程文件更新不会替设备立即更新本地副本，请先主动停用，或手动更新后重连。停用版不使用 `#!replace`，不会清空 Bilibili 或其他模块的 HTTPS 解密列表。若基础配置或其他覆写也添加了 X 的 API 解密域名，仍需从对应来源移除；停用版不能选择性删除其他来源的列表项。

## 可选网页版预览

独立地址，仅供愿意使用 Safari/PWA 网页版的用户：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/X_Web_remove_ads.stoverride
```

版本 `2026.10.24-web-preview.1`，使用之前独立编写的 JSON 过滤器，**尚未本机真机验收，不能去除原生 App 广告，也不保证完全不影响原生 App 使用的网页或内嵌页面。**

- 仅添加 `x.com` 为 HTTPS 解密域名；不添加 `api.x.com`、`api.twitter.com`、`twitter.com`。
- 仅匹配 `https://x.com/i/api/graphql/<query-id>/<operation>`，操作限定 `HomeTimeline`、`HomeLatestTimeline`、`TweetDetail`。
- 不匹配原生 API、旧 REST、登录、私信或账号写操作。HTTPS 解密本身仍是域名级别，URL 限定只控制正文脚本何时运行。
- 只删除显示容器上明确的 `promotedMetadata` / `promoted_metadata` 或推广条目 ID；保留普通媒体、引用、转推、分页与顺序，不按正文关键词删帖。
- 无额外 HTTP 请求、Cookie 收集、存储或内容日志。脚本约 6 KiB，配置和脚本独立缓存。

如选择使用：保持两个原生旧版和其他重叠 X 覆写停用，确保 Stash 自有证书已受信任，单独导入网页版预览。在 Safari 中访问 `https://x.com`；也可通过 Safari“分享 → 添加到主屏幕”使用 PWA。若出现加载问题立即停用网页版模块、重连恢复。无需为了继续使用原生 App 安装网页版模块。

## 性能与保护边界

- 只处理响应；正文超过 2 MiB 不触发，脚本上限 2 秒。无广告候选标记直接放行，有变化才重新序列化。
- 非 200、无效 JSON、不支持结构、二进制正文、超出 5 万对象访问预算或脚本内部异常保留原响应。
- 含不安全数字整数时整段放行，避免 JSON 重写损坏 64 位数字 ID；字符串型 ID 不受影响。
- 不保证处理视频贴片、软广、缓存广告或新的接口形状。
- 脚本内部放行无法补救脚本启动前的 TLS 失败、provider 下载故障或宿主超时。离线测试不证明手机延迟和客户端兼容性。

## 依据、验证与许可

`src/x-response.js` 为独立实现，没有从 Loon 原生 App 模块移植成功的依据。之前把网页结构扩大到原生 API 域名缺乏真机验证；当前已撤回。

- [fmz200 的 XWebAds 模块](https://github.com/fmz200/wool_scripts/blob/main/Surge/module/XWebAds.module) 明确标注网页版，只添加 `x.com`，处理上述三个网页操作；这是范围依据，不代表作者验证了本仓库模块。
- [public-clis/twitter-cli 的 parser.py](https://github.com/public-clis/twitter-cli/blob/main/twitter_cli/parser.py)、[Zam157 用户脚本](https://greasyfork.org/en/scripts/465165-fck-x-twitter/code) 与 [gallery-dl 响应样例讨论](https://github.com/mikf/gallery-dl/issues/4790) 为 timeline 结构及推广标记依据。
- [Stash MitM 文档](https://stash.wiki/http-engine/mitm) 说明解密和证书信任前提；[脚本文档](https://stash.wiki/script/rewrite-requests) 说明 `$done({})` 的透传语义；[覆写文档](https://stash.wiki/configuration/override) 说明数组默认合并及 `#!replace` 全替换行为。

`scripts/build-x.mjs` 可重建两个停用版、网页版和 SHA-256 清单。离线验证覆盖撤除配置、网页 URL 边界、JSON 过滤和数据保护，使用合成数据；未登录 X 或取得账号真实流量。源码按仓库 GPL-3.0-only 提供。
