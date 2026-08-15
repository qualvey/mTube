// ==============================================================================
// 上传队列管理器（模块级单例）
//
// 流程反转核心：视频发布不再阻塞在"上传完成"上。
// 1. 提交发布时 video 先以 UPLOADING 状态入库（C 端不可见）
// 2. 本队列拿到 File 后逐个后台传输（单飞：同一时刻只传一个，避免打满节点带宽）
// 3. 完成 → 调 upload-complete 回填 videoUrl/posterUrl 并自动流转 PUBLISHED/SCHEDULED
// 4. 失败 → 调 upload-failed 标记 FAILED（可重选文件断点续传）；取消 → 中止并标记 FAILED
//
// 生命周期：不随弹窗关闭销毁；页面刷新后队列清空（浏览器 File 丢失），
// 残留 UPLOADING 由服务端 6h 超时清扫转为 FAILED，重新选文件走 check-chunks 断点续传。
// ==============================================================================

import { ElMessage } from 'element-plus'
import { apiFetch } from '../utils/api.js'
import { uploadFileParallelChunks, uploadFileWithProgress } from '../utils/uploader.js'

const state = {
  items: [], // { id, videoId, taskId, fileName, file, nodeId, status, progress, speed, detail, label, error, abort, canceling }
  listeners: new Set(),
  processing: false,
}

let seq = 0
let cachedConcurrency = null

const notify = () => {
  for (const fn of state.listeners) fn()
}

/** 给上传引擎用的 ref 形状对象（引擎内部是 uploadProgress.value = x） */
const makeRefs = (item) => ({
  uploadProgress: {
    get value() { return item.progress },
    set value(v) { item.progress = v },
  },
  uploadSpeed: {
    get value() { return item.speed },
    set value(v) { item.speed = v },
  },
  uploadDetailText: {
    get value() { return item.detail },
    set value(v) { item.detail = v },
  },
  uploadStatusLabel: {
    get value() { return item.label },
    set value(v) { item.label = v },
  },
})

const getConcurrency = async () => {
  if (cachedConcurrency) return cachedConcurrency
  try {
    const res = await apiFetch('/api/v1/admin/settings')
    if (res.ok) {
      const json = await res.json()
      if (json.data && json.data.uploadChunkConcurrency) {
        cachedConcurrency = Math.min(8, Math.max(2, Number(json.data.uploadChunkConcurrency) || 4))
      }
    }
  } catch (e) { /* keep default */ }
  if (!cachedConcurrency) cachedConcurrency = 4
  return cachedConcurrency
}

/** 单个任务实际传输：取凭证 → 分片/单文件直传 → 回填 video 记录 */
const runUpload = async (item) => {
  const refs = makeRefs(item)
  item.abort = new AbortController()
  const signal = item.abort.signal

  item.label = '⚡ 获取直传凭证...'
  const ticketRes = await apiFetch('/api/v1/admin/videos/upload-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodeId: item.nodeId,
      // 文件指纹：主控据此生成确定性 uploadId（断点续传）
      filename: item.file.name,
      size: item.file.size,
      lastModified: item.file.lastModified,
    }),
    signal,
  })
  const ticketJson = await ticketRes.json()
  if (!ticketRes.ok || !ticketJson.data || !ticketJson.data.uploadUrl) {
    throw new Error(ticketJson.message || '获取直传凭证失败')
  }
  const ticket = ticketJson.data
  if (ticket.storageNodeId) item.nodeId = ticket.storageNodeId

  let result
  if (ticket.chunkUploadUrl && item.file.size >= 5 * 1024 * 1024) {
    const concurrency = await getConcurrency()
    item.label = `⚡ [${concurrency}通道直传] 传输至 [${ticket.storageNodeName || ticket.storageNodeId}]`
    result = await uploadFileParallelChunks(ticket, item.file, refs, { concurrency, signal })
  } else {
    const formData = new FormData()
    formData.append('video', item.file)
    item.label = `⚡ [直传模式] 传输至 [${ticket.storageNodeName || ticket.storageNodeId}]`
    result = await uploadFileWithProgress(ticket.uploadUrl, formData, ticket.headers || {}, refs, signal)
  }

  const directJson = result.data
  if (!result.ok || !directJson.data || !directJson.data.videoUrl) {
    throw new Error(directJson.message || '存储节点上传失败')
  }

  // 回填视频记录：upload-complete 内部自动流转 PUBLISHED / SCHEDULED
  item.label = '📝 登记视频记录...'
  item.progress = 100
  const completeRes = await apiFetch(`/api/v1/admin/videos/${item.videoId}/upload-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoUrl: directJson.data.videoUrl,
      posterUrl: directJson.data.posterUrl || '',
      storageNodeId: directJson.data.storageNodeId || ticket.storageNodeId || item.nodeId,
    }),
  }).catch(() => null)
  if (!completeRes || !completeRes.ok) {
    // 文件已传成功但登记失败：重试一次，仍失败则提示（视频会由超时清扫转 FAILED，可重传）
    const retryRes = await apiFetch(`/api/v1/admin/videos/${item.videoId}/upload-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrl: directJson.data.videoUrl,
        posterUrl: directJson.data.posterUrl || '',
        storageNodeId: directJson.data.storageNodeId || ticket.storageNodeId || item.nodeId,
      }),
    }).catch(() => null)
    if (!retryRes || !retryRes.ok) {
      console.warn('[UploadQueue] upload-complete 回填失败（重试后）:', completeRes?.status)
    }
  }
}

const reportFailure = async (item, message) => {
  item.error = message
  try {
    await apiFetch(`/api/v1/admin/videos/${item.videoId}/upload-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })
  } catch (e) { /* ignore */ }
}

/** 队列泵：单飞，一次只处理一个 queued 项 */
const pump = async () => {
  if (state.processing) return
  const item = state.items.find(i => i.status === 'queued' && !i.canceling)
  if (!item) return

  state.processing = true
  item.status = 'uploading'
  notify()

  try {
    await runUpload(item)
    if (item.canceling) {
      item.status = 'canceling'
    } else {
      item.status = 'done'
      item.label = '✅ 上传完成，视频已上线'
      ElMessage.success(`【${item.fileName}】上传完成，已自动上线`)
    }
  } catch (err) {
    if (err.name === 'AbortError' || item.canceling) {
      item.status = 'canceling'
      await reportFailure(item, '用户取消')
      ElMessage.warning(`【${item.fileName}】上传已取消`)
    } else {
      item.status = 'failed'
      await reportFailure(item, err.message)
      ElMessage.error(`【${item.fileName}】上传失败: ${err.message}`)
    }
  } finally {
    state.processing = false
    // 完成/取消的项短暂保留展示后自动移除
    if (item.status === 'done' || item.status === 'canceling') {
      setTimeout(() => {
        state.items = state.items.filter(i => i.id !== item.id)
        notify()
      }, 4000)
    }
    notify()
    pump()
  }
}

export const uploadQueue = {
  get items() { return state.items },

  subscribe(fn) {
    state.listeners.add(fn)
    return () => state.listeners.delete(fn)
  },

  /** 发布后入队：videoId 必填（UPLOADING 状态记录）；file 必填（浏览器 File） */
  enqueue({ videoId, taskId, fileName, file, nodeId }) {
    if (!videoId || !file) {
      console.warn('[UploadQueue] enqueue 需要 videoId 与 file')
      return null
    }
    const item = {
      id: `uq_${Date.now()}_${++seq}`,
      videoId,
      taskId: taskId || null,
      fileName: fileName || file.name || '未命名文件',
      file,
      nodeId: nodeId || undefined,
      status: 'queued',
      progress: 0,
      speed: '',
      detail: '',
      label: '排队等待传输...',
      error: '',
      abort: null,
      canceling: false,
    }
    state.items.push(item)
    notify()
    pump()
    return item
  },

  /** 失败重试：重新选择文件（同文件自动断点续传） */
  retry(itemId, file) {
    const item = state.items.find(i => i.id === itemId)
    if (!item) return
    if (file) item.file = file
    item.status = 'queued'
    item.error = ''
    item.progress = 0
    item.speed = ''
    item.detail = ''
    item.label = '排队等待重传...'
    item.canceling = false
    notify()
    pump()
  },

  /** 取消：中止在途请求，视频标记 FAILED（可删除或重试） */
  cancel(itemId) {
    const item = state.items.find(i => i.id === itemId)
    if (!item) return
    item.canceling = true
    if (item.abort) item.abort.abort()
    else {
      item.status = 'canceling'
      reportFailure(item, '用户取消')
      setTimeout(() => {
        state.items = state.items.filter(i => i.id !== itemId)
        notify()
      }, 500)
    }
    notify()
  },

  /** 从队列移除（失败项丢弃，不通知服务端） */
  discard(itemId) {
    state.items = state.items.filter(i => i.id !== itemId)
    notify()
  },
}
