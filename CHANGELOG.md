# Changes

## 2026.10.24-preview.2

- 默认跳过全部评论接口，将 MainList 评论去广告拆成可选模块。
- 提供固定远程覆写 URL，脚本改为独立下载缓存。
- 用内容版本目录及 provider 名称避免配置更新后复用旧脚本缓存。
- 添加远程产物哈希验证及 GitHub Actions。

## 2026.10.24-preview.1

- 提取 Kelee 明文插件并转换原生 jq/mock 规则。
- 适配 gzip/gRPC 与 Stash 响应字段。
- 增加空降正负缓存、查询超时及失败回退。
