# 普通版 iPhone B站：播放器延后空降预览

当前 `2026.10.25-preview.6` 适配用户确认的普通版哔哩哔哩。它改变空降架构，不再在弹幕请求前或响应交付前查询片段。**真机加载、第三方模块兼容、原生桥接和实际跳转仍未验收，不能把模拟检查当作不卡顿保证。**

## 什么时候查询，如何处理中插

1. 通过 ViewProgress 向普通版 App 提供修改过的 Chronos 播放器资源；普通弹幕接口 `DmSegMobile` 没有脚本、没有上下文头。
2. 播放器拿到 ready 的 aid/CID 后，监测正常播放、页面运行和进度连续推进。约 8 秒后发起一次独立异步查询。暂停/拖动/停止推进会重置稳定时间；后台不发起查询并停止轮询。
3. 查询整个视频已标注的广告区间，保存在播放器中。通过播放更新及一秒轮询检查进度；到达区间起点后保留两秒宽限，再跳到结束位置。
4. 查询结果晚到时，若当前仍在广告区间内可以补跳；整段已过不回退。多个重叠区间先合并，只向前跳。已知视频时长不足以容纳区间时不跳。
5. 当前暂停或后台时不跳；手动拖回本次已跳过的区间时不再强制跳。切换视频及返回同一视频均有代次校验，旧回调不能跳错视频或取消新查询的超时保护。

这支持视频中段的已标注广告，不要求中插出现时重新加载弹幕。也不代表能过滤平台另行插入、不在原视频时间轴上的广告或没有标注的内容。

**8 秒仅是避开初始加载的启发式条件。** Stash 没有整个 App 的“所有资源和评论加载完成”通知；Chronos 的进度时钟可能插值，因此进度推进也不严格等于每帧已解码。独立查询仍使用 Stash 网络设施，无法从源码证明不会竞争手机底层资源。

## 查询链与缓存

播放器的原生 `URLRequest` 桥接请求：

```text
https://api.bilibili.com/x/stash-airborne/segments?aid=<aid>&cid=<cid>
```

这是本模块自定义端点，不是公开 Bilibili API。Stash 的精确请求 hook 直接回应 `[[start,end],...]`，正常不把合成请求转发到 Bilibili。若模块未启用，原站不提供此端点，播放器按失败处理。

独立 worker 使用原来的 `bsbsb.top` 数据源，但不复制 Cookie、Authorization 或其他用户头。只传视频标识，验证 GET、精确域名路径、唯一 aid/CID、数值范围与片段格式。原始服务数据上限 128 KiB，最多 100 段，去重排序，区间至少 8 秒。

`bili.stash.sponsor.v2` 为独立缓存，避免复用 preview.5 短超时产生的失败状态：正向 6 小时、空结果 10 分钟、失败 60 秒，最多 64 条。服务客户端超时 1 秒、额外保护 1.2 秒；晚回调不写缓存、不重复完成。存储租约非原子，只尽力防重复请求。播放器原生请求另有 3 秒超时和 4 秒逻辑保护，均不持有普通弹幕响应。

每次访问视频只主动查询一次，失败时继续普通播放，不循环重试。播放器也保存有限本次进程缓存；失败/空结果可能使这次访问不能空降。内存与 Stash 缓存都不是账号持久化数据，不收集观看内容日志。

## 资源来源与可重建性

- 原包：[kokoryh/chronos 的标准包](https://github.com/kokoryh/chronos/blob/master/e5a968f1a5055bbe5c12e67b100a6dcb.zip)，MD5 与文件名一致；SHA-256 固定为 `c82d74ac16e2d1ecb82f8f3d3cab2fc9fe5cc49d243964a9bd4a3877a642056e`，保存于 `upstream/chronos/`。
- `scripts/build-chronos.mjs` 只修改 `res/src/danmaku/business/demand/entry_point/index_main.js`，在独一的 `Ps.ready()` 后安装 `src/chronos-deferred.js`；其余入口、info.json、原作者归属、图片与其他资源内容不变。
- 所有 ZIP 条目排序及时间戳固定，压缩后重新计算 MD5/SHA-256；输出 `scripts/chronos/<md5>.zip` 与 `modules/chronos.manifest.json`。ViewProgress 的资源地址与 MD5 一并更新，旧缓存不会混用。
- 初次更新需下载约 1 MiB 新播放器资源，可能有一次性等待。HD/国际版及其他未知资源保留原版资源映射，未适配本次延后自动跳转。
- 根据上游仓库 GPL-3.0 分发；包含上游资源和本地修改，未获上游验收或背书，详见 THIRD_PARTY_NOTICES.txt。

## 原包中实际使用的桥接合约

原包闭包内已有的接口被复用，并非假定 App 支持浏览器 API：

| 对象/桥接 | 原包行为 | 本模块用途 |
| --- | --- | --- |
| `hS` / `GetWorkInfo` | ready 之前无有效工作信息，成功后发出 `onCurrentWorkInfoChanged` | 读取 `workId`(aid)、`videoId`(CID)、毫秒 `duration`，识别切换 |
| `Kp` / `Yp` | `currentTime` 为秒、`playbackRate` 与进度/seek 监听 | 延后及监测中插 |
| `uc.create(...).invoke(...)` | 通过 `URLRequest` 异步取原始 `content`，支持 `expired` 标记 | 获取裸数组，不使用要求 code/data 封装的 `Ie` |
| `seekTo(seconds)` | 发出 `UpdatePlaybackStatus.current_time=seconds*1000` | 正向跳到广告段末 |
| `cron.Task.scheduleTask/cancelTask` | 原生任务计时 | 轮询及逻辑超时，不是 Stash `$done` 后的定时器 |

原生是否接受本地改包、是否允许这个合成请求、是否添加额外 URL 参数，以及播放器关闭时是否销毁 JS realm，仍需手机验证。控制器在同一 context 内重复安装会先清理旧任务/监听，后台会停止轮询；不能据此证明不同原生 realm 的生命周期完全等价。

## 离线验收范围

测试包括：弹幕无 hook、合成端点范围、缓存和认证隔离、迟到回调、8 秒延后、暂停/后台/seek、视频代次、中插及段内晚到补跳、跨时区 ZIP 稳定性、其他资源逐字节保留、MD5 和源码一致性。另从原包提取真实 `uc` 和 `Kp` 类，在模拟桥接下验证原始 JSON 与秒转毫秒合约。

这些测试没有登录账号、没有捕获真实用户流量、没有运行 iPhone 原生播放器。真实效果以设备反馈为准；原评论传输回退仍可能独立增加等待。

相关官方文档：[Stash 响应改写](https://stash.wiki/script/rewrite-requests)、[脚本生命周期](https://stash.wiki/script/syntax-and-interface)。
