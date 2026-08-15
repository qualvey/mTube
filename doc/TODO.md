# TODO / 待办清单

> 登记日期：2026-08-14
> 来源：admin 视频上传功能分析（`doc/video_upload_redesign.md`）

## 视频上传 — 待办

- [x] **P0-1** `VideoUploadModal.vue`：`registerTaskIfVideo` 引用未定义变量 `fieldName` → 每次上传成功都抛 ReferenceError（弹「上传读取异常」错误提示），任务队列永不登记，上传文件沦为孤儿（24h 才回收）。直传分支内该调用被重复写了两行。**状态：已随流程反转重构消除**（2026-08-14，上传逻辑整体移入 `uploadQueue.js`）
- [x] **P0-2** `VideosView.vue`：`resetFormForQueue` 中文字符串乱码（`author: '?????'`、`tags: ['??']`）。**状态：已修复**（2026-08-14，恢复「官方创作者」/「新增」）
- [x] **上传逻辑重构（当前最高优先级）**：每个上传视频任务可直接发布（先入队列占位 + 后台上传，而不是上传完才能点发布）。
  - **状态：已实施**（2026-08-14）：`doc/video_upload_redesign.md` §3.7 / §3.7.6
  - 落地：admin `uploadQueue.js` 单飞队列 + 弹窗选文件暂存直接发布；server `UPLOADING`/`FAILED` 状态 + `upload-complete`/`upload-failed`/`upload-retry` + 6h 超时清扫；中转上传改流式透传（主控零落盘）

## 视频上传 — 后续优化

- [x] **直传凭证 scope 化（P1-2）**：已实施（2026-08-14）。签名绑定 uploadId（`X-Cluster-Scope`），存储节点限定路径白名单 + uploadId 一致性校验，浏览器凭证无法重放到 delete/cleanup；upload-ticket 增加健康探测（不可达自动回退默认节点）与能力协商（capability/chunkSize/maxSingleSize）；uploadId 改由主控签发（确定性指纹，断点续传保留）；分片请求 uploadId 同时放 query（鉴权先于 multer 执行）
- [x] **上传后试播预览**：已实施（2026-08-14）。编辑弹窗内嵌 `<video>` 试播（仅验证可播性；防盗链 Referer/UA 需 C 端验证，文档已注明）
- [ ] 任务队列分页/搜索/状态筛选
- [ ] 封面上传去 base64（改 multipart）

## 其他（非上传）

- （待补充）
