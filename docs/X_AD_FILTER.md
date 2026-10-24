# X/Twitter 去广告覆写

远程导入地址：

```text
https://raw.githubusercontent.com/xian2023/stash-modules/main/modules/X_remove_ads.stoverride
```

这是独立的 Stash 模块，可与本仓库的 Bilibili 模块同时启用。启用并信任 Stash HTTPS 解密证书，停用其他改写相同 X 接口的脚本，然后完全退出 X 再打开。当前版本 `2026.10.24-preview.1`，尚未 iPhone/X 真机验收。

## 范围

对选定的 GraphQL 只读时间线和旧版 REST 时间线 JSON 响应进行过滤，目标包括首页、关注、推文详情/回复、搜索、个人页面、列表、书签和社区中带明确广告标记的条目。匹配的是操作名称，不绑定易变的 GraphQL query-id。

只移除显示容器上的 `promotedMetadata` / `promoted_metadata`，或条目 ID 中明确的 `promoted-tweet/user/trend/account` 标记。混合模块仅删除广告子条目；全部为广告的空模块删除。保留普通媒体、引用推文和转推、置顶、普通关注推荐、顺序及分页游标；不会根据“广告”“赞助”等普通文字判断广告。

模块只处理响应，不修改请求，不查询额外服务器，不写持久化存储，不输出推文或账号日志。脚本约 6 KiB，无运行时依赖。远程脚本按内容版本缓存，配置约 1.4 KiB。

## 性能与边界

- 正文超过 2 MiB 不进入脚本；脚本执行上限 2 秒。无广告候选标记时直接放行，有变化才重新序列化 JSON。
- 数据结构不支持、格式错误、非 200 响应、二进制正文或遍历超过 5 万节点时保留原响应。
- 为防 `JSON.parse/stringify` 损坏数字型 64 位 ID，包含不安全整数的响应整段放行；字符串型大 ID 不受影响。部分旧接口因此可能保留广告。
- 仅处理已列出的 JSON 时间线接口。未覆盖的客户端接口、视频内插播广告、图片里的推广、没有明确标记的软广，以及 App 已缓存的旧数据，可能仍有广告。
- HTTPS 解密、脚本启动和 JSON 处理都有开销。离线测试不能证明手机延迟、所有 X 版本或所有地区账号的兼容性。若启用后加载异常，先停用 X 模块；进一步定位需要版本和相关接口形状，不需要提供 Cookie 或账号令牌。

## 结构依据及实现

本仓库独立编写 Stash 适配，没有把未经验证的 Loon/Surge 转换标成可用移植版。`src/x-response.js` 是完整源代码，`scripts/build-x.mjs` 生成独立模块和 `scripts/x/<内容版本>/response.js`；`modules/X_remove_ads.manifest.json` 保存 SHA-256。旧的 Bilibili 模块及其行为不变。

以下维护者源码仅作为时间线结构与标记的依据，不代表他们验证了本模块：

- [public-clis/twitter-cli 的 parser.py](https://github.com/public-clis/twitter-cli/blob/main/twitter_cli/parser.py)，`parse_timeline_response` 明确处理 `instructions`、`entries`、`moduleItems`、模块 `items`、`promotedMetadata` 和分页游标。
- [Zam157 的用户脚本原源码](https://greasyfork.org/en/scripts/465165-fck-x-twitter/code)，处理 `home_timeline_urt`、`threaded_conversation_with_injections_v2` 与推广元数据。这是浏览器脚本，不能作为 iPhone Stash 实测依据。
- [mikf/gallery-dl 的 Twitter 讨论及原始响应样例](https://github.com/mikf/gallery-dl/issues/4790)，说明推广内容与普通推文共用时间线，来源标记不等于独立广告域名。
- [Stash 响应脚本接口](https://stash.wiki/script/rewrite-requests)。

离线测试使用手工合成 JSON，覆盖广告识别、普通条目/游标保留、模块及替换指令、旧接口形状、错误透传、大整数保护和只读 URL 匹配。没有登录 X、调用用户账号接口或保存真实用户时间线。

本地实现按仓库 GPL-3.0-only 许可提供。
