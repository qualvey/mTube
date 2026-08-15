# TODO / 待办清单

> 登记日期：2026-08-14
> 来源：admin 视频上传功能分析（`doc/video_upload_redesign.md`）

## 视频上传 — 待办

- [x] **P0-1** `VideoUploadModal.vue`：`registerTaskIfVideo` 引用未定义变量 `fieldName` → 每次上传成功都抛 ReferenceError（弹「上传读取异常」错误提示），任务队列永不登记，上传文件沦为孤儿（24h 才回收）。直传分支内该调用被重复写了两行。**状态：已随流程反转重构消除**（2026-08-14，上传逻辑整体移入 `uploadQueue.js`）
- [x] **P0-2** `VideosView.vue`：`resetFormForQueue` 中文字符串乱码（`author: '?????'`、`tags: ['??']`）。**状态：已修复**（2026-08-14，恢复「官方创作者」/「新增」）
- [x] **上传逻辑重构（当前最高优先级）**：每个上传视频任务可直接发布（先入队列占位 + 后台上传，而不是上传完才能点发布）。
  - **状态：已实施**（2026-08-14）：`doc/video_upload_redesign.md` §3.7 / §3.7.6
  - 落地：admin `uploadQueue.js` 单飞队列 + 弹窗选文件暂存直接发布；server `UPLOADING`/`FAILED` 状态 + `upload-complete`/`upload-failed`/`upload-retry` + 6h 超时清扫；中转上传改流式透传（主控零落盘）

## 视频上传 — 后续优化（未排期）

- [ ] 直传凭证 scope 化（P1-2）：签名绑定 uploadId + 短 TTL，浏览器凭证不可重放到 delete/cleanup 接口
- [ ] 节点能力协商（老节点自动降级）+ 凭证下发前健康探测
- [ ] 上传后试播预览（验证防盗链 headers）
- [ ] 任务队列分页/搜索/状态筛选
- [ ] 封面上传去 base64（改 multipart）

## 其他（非上传）

- （待补充）
