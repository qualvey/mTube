<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <!-- Top Action Bar & Filters -->
    <div class="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 w-full md:max-w-xl">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索视频标题、创作者或 ID..."
          clearable
          prefix-icon="Search"
          class="w-full"
        />
        <el-select v-model="selectedNodeFilter" placeholder="全部存储节点" clearable class="w-full sm:w-48 shrink-0">
          <el-option label="全部存储节点" value="" />
          <el-option
            v-for="node in storageNodes"
            :key="node.id"
            :label="`${node.name} (${node.id})`"
            :value="node.id"
          />
        </el-select>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
        <el-tag v-if="enableDirectUpload" type="success" size="large" effect="light" class="font-bold justify-center">
          ⚡ 4通道直传模式 (已激活)
        </el-tag>
        <el-tag v-else type="info" size="large" effect="light" class="justify-center">
          📦 主控中转模式
        </el-tag>

        <el-tag
          v-if="scheduledCount > 0"
          type="warning"
          size="large"
          effect="light"
          class="font-bold cursor-pointer justify-center select-none"
          :class="statusFilter === 'SCHEDULED' ? '!border-amber-500 !text-amber-700' : ''"
          @click="toggleScheduledFilter"
        >
          ⏱ 待发布 {{ scheduledCount }}
        </el-tag>

        <el-button type="warning" size="large" icon="Plus" class="font-bold mobile-full-button" @click="openAddModal">
          发布新视频
        </el-button>
      </div>
    </div>

    <!-- 后台传输队列（流程反转：发布即入队，文件后台传输） -->
    <el-card v-if="queueItems.length" class="rounded-2xl shadow-sm border-emerald-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-bold text-emerald-800">🚀 后台传输队列（{{ queueItems.length }}）</span>
          <span class="text-xs text-slate-400">单飞模式：同一时刻只传一个，不阻塞其他操作</span>
        </div>
      </template>
      <div class="flex flex-col gap-2">
        <div
          v-for="q in queueItems"
          :key="q.id"
          class="border border-slate-200 rounded-xl p-3 flex flex-col gap-2"
          :class="{ 'bg-emerald-50/60': q.status === 'done', 'bg-red-50/60': q.status === 'failed' }"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-700 truncate">🎬 {{ q.fileName }}</span>
            <div class="flex items-center gap-1.5 shrink-0">
              <el-tag v-if="q.status === 'queued'" size="small" type="info" effect="light">排队中</el-tag>
              <el-tag v-else-if="q.status === 'uploading'" size="small" type="warning" effect="light">
                传输中 {{ q.progress }}%
              </el-tag>
              <el-tag v-else-if="q.status === 'done'" size="small" type="success" effect="light">✅ 已完成</el-tag>
              <el-tag v-else-if="q.status === 'failed'" size="small" type="danger" effect="light">❌ 失败</el-tag>
              <el-tag v-else size="small" type="info" effect="light">取消中</el-tag>
              <el-button
                v-if="q.status === 'uploading' || q.status === 'queued'"
                size="small"
                type="danger"
                plain
                @click="cancelQueueItem(q)"
              >取消</el-button>
              <el-button
                v-if="q.status === 'failed'"
                size="small"
                type="warning"
                plain
                @click="retryQueueItem(q)"
              >重选文件重试</el-button>
            </div>
          </div>
          <el-progress
            v-if="q.status === 'uploading' || q.status === 'queued'"
            :percentage="q.progress"
            :stroke-width="6"
            striped
            striped-flow
          />
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span class="truncate">{{ q.label }}</span>
            <span v-if="q.speed" class="text-emerald-600 font-bold shrink-0">⚡ {{ q.speed }}</span>
          </div>
          <div v-if="q.error" class="text-[11px] text-red-600 font-bold">原因：{{ q.error }}</div>
        </div>
      </div>
    </el-card>

    <!-- 发布任务队列（常驻；新建任务可先占位后上传，可完善发布 / 取消） -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span class="font-bold text-slate-800">发布任务队列（{{ uploadTasksTotal }}）</span>
          <div class="flex flex-wrap items-center gap-2">
            <el-input
              v-model="taskKeyword"
              placeholder="搜索文件名/地址/视频ID"
              clearable
              size="small"
              style="width: 200px"
              @keyup.enter="fetchUploadTasks"
              @clear="fetchUploadTasks"
            />
            <el-select v-model="taskStatusFilter" size="small" style="width: 110px" @change="fetchUploadTasks">
              <el-option label="全部状态" value="" />
              <el-option label="待完善" value="uploaded" />
              <el-option label="已完成" value="completed" />
              <el-option label="失败" value="failed" />
            </el-select>
            <el-button size="small" type="warning" plain icon="Plus" @click="createEmptyTask">新建任务</el-button>
            <el-button size="small" icon="Refresh" @click="fetchUploadTasks">刷新</el-button>
          </div>
        </div>
      </template>
      <el-table :data="uploadTasks" size="small" stripe>
        <el-table-column label="文件" min-width="180">
          <template #default="{ row }">
            <span class="font-mono text-xs text-slate-600">{{ row.fileName || row.fileUrl || '（未命名）' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'completed'" type="success" size="small" effect="light">已完成</el-tag>
            <el-tag v-else-if="row.status === 'failed'" type="danger" size="small" effect="light">失败</el-tag>
            <el-tag v-else :type="row.fileUrl ? 'success' : 'warning'" size="small" effect="light">
              {{ row.fileUrl ? '待完善' : '待上传' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="140">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="right">
          <template #default="{ row }">
            <template v-if="row.status === 'uploaded'">
              <el-button size="small" type="primary" plain @click="openAddModalFromTask(row)">完善并发布</el-button>
              <el-button size="small" type="danger" plain @click="cancelTask(row)">取消</el-button>
            </template>
            <el-button v-else size="small" plain @click="openAddModalFromTask(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!uploadTasks.length" class="text-center py-6 text-slate-400 text-sm">
        暂无匹配任务。点击「新建任务」先占位（无需先上传文件），或上传视频会自动入队。
      </div>
      <div v-if="uploadTasksTotal > taskPageSize" class="flex justify-end mt-3">
        <el-pagination
          layout="prev, pager, next"
          :total="uploadTasksTotal"
          :page-size="taskPageSize"
          :current-page="taskPage"
          small
          @current-change="(p) => { taskPage = p; fetchUploadTasks() }"
        />
      </div>
      <div class="text-xs text-slate-400 mt-2">
        「完善并发布」打开编辑弹窗（已上传文件自动预填）；「取消」同时删除已上传文件（不浪费空间）。
      </div>
    </el-card>

    <!-- Video List Table Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span class="font-bold text-slate-800">📹 全库视频流管理 (共 {{ filteredVideos.length }} 部)</span>
          <el-button size="small" icon="Refresh" class="mobile-full-button" @click="fetchVideos">刷新数据</el-button>
        </div>
      </template>

      <div class="admin-table-scroll">
        <el-table :data="filteredVideos" style="width: 100%" stripe>
        <el-table-column label="封面" width="90">
          <template #default="{ row }">
            <img :src="row.poster || 'https://via.placeholder.com/150'" class="w-16 h-11 rounded-lg object-cover border shadow-sm" />
          </template>
        </el-table-column>

        <el-table-column label="视频标题 / 描述" min-width="220">
          <template #default="{ row }">
            <div class="font-bold text-slate-800 text-sm line-clamp-1">{{ row.title }}</div>
            <div class="text-xs text-slate-400 line-clamp-1 mt-0.5">{{ row.description || '暂无详细描述' }}</div>
            <div v-if="row.tags && row.tags.length" class="flex items-center gap-1 mt-1">
              <el-tag v-for="t in row.tags" :key="t" size="mini" type="info" class="px-1.5 py-0 text-[10px]">{{ t }}</el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="创作者" width="120">
          <template #default="{ row }">
            <div class="text-xs font-bold text-slate-700">{{ row.author || '官方' }}</div>
          </template>
        </el-table-column>

        <el-table-column label="存储节点" width="160">
          <template #default="{ row }">
            <el-tag size="small" type="warning" effect="light" class="font-mono font-bold">
              📦 {{ getStorageNodeName(row.storageNodeId) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="访问统计" width="100">
          <template #default="{ row }">
            <span class="text-xs font-mono font-bold text-amber-600">{{ row.views || 0 }} 次</span>
          </template>
        </el-table-column>

        <el-table-column label="发布状态" width="170">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'UPLOADING'" type="warning" size="small" effect="light" class="font-bold">
              🚀 上传中 {{ queueProgressOf(row.id) }}
            </el-tag>
            <el-tag v-else-if="row.status === 'FAILED'" type="danger" size="small" effect="light" class="font-bold">
              ❌ 上传失败
            </el-tag>
            <el-tag v-else-if="row.status === 'SCHEDULED'" type="warning" size="small" effect="light" class="font-bold">
              ⏰ 定时 {{ formatPublishTime(row.publishAt) }}
            </el-tag>
            <el-tag v-else type="success" size="small" effect="light" class="font-bold">已发布</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="VIP 试看限制" width="140">
          <template #default="{ row }">
            <el-switch
              v-model="row.isVip"
              active-text="VIP"
              inactive-text="免费"
              size="small"
              @change="toggleVipStatus(row)"
            />
          </template>
        </el-table-column>

        <el-table-column label="播放链接预览" min-width="180">
          <template #default="{ row }">
            <div class="text-xs font-mono text-slate-500 truncate max-w-xs" :title="row.videoUrl">
              {{ row.videoUrl }}
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <el-button v-if="row.status === 'SCHEDULED'" size="small" type="success" plain @click="publishNow(row)">立即发布</el-button>
              <el-button size="small" type="primary" plain icon="Edit" @click="openEditModal(row)">编辑</el-button>
              <el-button size="small" type="danger" plain icon="Delete" @click="handleDeleteVideo(row.id)">删除</el-button>
            </div>
          </template>
        </el-table-column>
        </el-table>
      </div>

      <div v-if="!filteredVideos.length" class="text-center py-12 text-slate-400 text-sm">
        暂无匹配的视频记录
      </div>
    </el-card>

    <!-- Video Add / Edit Dialog Component -->
    <VideoUploadModal
      v-model:visible="modalVisible"
      :is-edit="isEdit"
      :form="videoForm"
      :storage-nodes="storageNodes"
      :available-tags="availableTagOptions"
      :enable-direct-upload="enableDirectUpload"
      :submitting="submitLoading"
      @submit="handleModalSubmit"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import VideoUploadModal from '../components/VideoUploadModal.vue'
import { DEFAULT_UA, buildHeadersJson } from '../utils/formatters.js'
import { getPublishPref, nextUtc8MidnightTs, nextPublishDefaultTs } from '../utils/publishPref.js'
import { apiFetch } from '../utils/api.js'
import { uploadQueue } from '../services/uploadQueue.js'

// ── 后台传输队列（流程反转：发布即入队）──────────────
const queueItems = ref([])
const unsubscribeQueue = uploadQueue.subscribe(() => {
  const prev = queueItems.value
  const next = [...uploadQueue.items]
  // 有任务从传输中/排队 → 完成/失败/取消：刷新视频列表让状态列同步
  const finished = next.some(i =>
    (i.status === 'done' || i.status === 'failed' || i.status === 'canceling') &&
    prev.some(p => p.id === i.id && (p.status === 'uploading' || p.status === 'queued'))
  )
  queueItems.value = next
  if (finished) fetchVideos()
})
queueItems.value = [...uploadQueue.items]

/** 列表行关联：当前是否有在传任务及其进度（视频行状态列展示） */
const queueProgressOf = (videoId) => {
  const q = uploadQueue.items.find(i => i.videoId === videoId && (i.status === 'uploading' || i.status === 'queued'))
  return q ? `${q.progress}%` : ''
}

const cancelQueueItem = (q) => {
  uploadQueue.cancel(q.id)
}

/** 失败重试：重新选择文件（同文件自动断点续传） */
const retryQueueItem = (q) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'video/*,.mp4,.mov,.webm,.mkv,.avi,.flv,.wmv,.m4v'
  input.onchange = () => {
    const file = input.files && input.files[0]
    if (file) {
      uploadQueue.retry(q.id, file)
      ElMessage.success(`已选择 ${file.name}，重新传输中（断点续传）`)
    }
  }
  input.click()
}

const videoList = ref([])
const storageNodes = ref([])
const searchKeyword = ref('')
const selectedNodeFilter = ref('')
const enableDirectUpload = ref(true)

const modalVisible = ref(false)
const isEdit = ref(false)
/** 提交中标记（防重复提交；按钮 loading 展示在弹窗内部） */
const submitLoading = ref(false)
const videoForm = ref({
  id: '',
  taskId: null,
  title: '',
  description: '',
  author: '官方创作者',
  storageNodeId: 'node-01',
  videoUrl: '',
  referer: '',
  userAgent: DEFAULT_UA,
  poster: '',
  isVip: true,
  previewDuration: 120,
  tags: ['新增'],
  // 发布策略：scheduled=true 定时发布（publishAtMs 可空，留空默认下个 UTC+8 00:00）；false = 立即发布
  status: 'PUBLISHED',
  scheduled: false,
  publishAtMs: null
})

const availableTagOptions = ref(['独家', '高能', '超清', '无删减', '热门', '推荐'])

const fetchUploadConfig = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/upload-config')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        enableDirectUpload.value = json.data.enableDirectUpload !== false
      }
    }
  } catch (e) {}
}

const fetchStorageNodes = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/storage-nodes')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        storageNodes.value = json.data
      }
    }
  } catch (e) {}
}

const fetchVideos = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/videos')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        videoList.value = json.data
      }
    }
  } catch (e) {
    ElMessage.error('获取视频列表失败')
  }
}

onMounted(() => {
  fetchUploadConfig()
  fetchStorageNodes()
  fetchVideos()
  fetchUploadTasks()
})

onBeforeUnmount(() => {
  unsubscribeQueue()
})

/** 状态筛选：'' = 全部 / SCHEDULED = 待发布队列 */
const statusFilter = ref('')
const scheduledCount = computed(() => videoList.value.filter(v => v.status === 'SCHEDULED').length)

const toggleScheduledFilter = () => {
  statusFilter.value = statusFilter.value === 'SCHEDULED' ? '' : 'SCHEDULED'
}

const filteredVideos = computed(() => {
  return videoList.value.filter(v => {
    const matchKeyword = !searchKeyword.value ||
      (v.title && v.title.toLowerCase().includes(searchKeyword.value.toLowerCase())) ||
      (v.author && v.author.toLowerCase().includes(searchKeyword.value.toLowerCase())) ||
      (v.id && String(v.id).includes(searchKeyword.value))

    const matchNode = !selectedNodeFilter.value || v.storageNodeId === selectedNodeFilter.value
    const matchStatus = !statusFilter.value || v.status === statusFilter.value

    return matchKeyword && matchNode && matchStatus
  })
})

const getStorageNodeName = (nodeId) => {
  const node = storageNodes.value.find(n => n.id === nodeId)
  return node ? `${node.name} (${node.id})` : (nodeId || '默认节点')
}

// ── 发布任务队列 ─────────────────────────────────────────
const uploadTasks = ref([])
const uploadTasksTotal = ref(0)
const taskPage = ref(1)
const taskPageSize = 8
const taskKeyword = ref('')
const taskStatusFilter = ref('')

const fetchUploadTasks = async () => {
  try {
    const params = new URLSearchParams()
    if (taskKeyword.value.trim()) params.set('keyword', taskKeyword.value.trim())
    if (taskStatusFilter.value) params.set('status', taskStatusFilter.value)
    params.set('limit', String(taskPageSize))
    params.set('offset', String((taskPage.value - 1) * taskPageSize))

    const res = await apiFetch(`/api/v1/admin/upload-tasks?${params.toString()}`)
    if (res.ok) {
      const json = await res.json()
      if (json && Array.isArray(json.data)) {
        // 兼容无分页旧响应
        uploadTasks.value = json.data
        uploadTasksTotal.value = json.data.length
      } else if (json && json.data && Array.isArray(json.data.items)) {
        uploadTasks.value = json.data.items
        uploadTasksTotal.value = json.data.total ?? json.data.items.length
      }
    }
  } catch (e) { /* ignore */ }
}

/** 新建任务：无需文件先占位入队 */
const createEmptyTask = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/upload-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: '新任务' })
    })
    const json = await res.json()
    if (res.ok && json.data) {
      ElMessage.success('已创建任务，可上传文件后发布')
      fetchUploadTasks()
      openAddModalFromTask(json.data)
    } else {
      ElMessage.error(json?.message || '创建失败')
    }
  } catch (e) {
    ElMessage.error('创建失败: ' + e.message)
  }
}

/** 任务 → 完善并发布：打开添加弹窗（有文件则预填）；已关联视频的任务直接打开对应视频编辑 */
const openAddModalFromTask = (task) => {
  // 已完成/已关联视频：直接编辑对应视频（避免「完善并发布」重复创建新视频）
  if (task.videoId) {
    const v = videoList.value.find(x => x.id === task.videoId)
    if (v) {
      openEditModal(v)
      return
    }
  }
  openAddModal()
  if (task.fileUrl) videoForm.value.videoUrl = task.fileUrl
  videoForm.value.taskId = task.id
}

/** 取消任务：删任务记录 + 删已上传文件；若关联 UPLOADING/FAILED 视频一并删除（未发布成功） */
const cancelTask = async (task) => {
  try {
    await ElMessageBox.confirm(`取消任务并删除已上传文件？\n${task.fileName || task.fileUrl}`, '取消任务', { type: 'warning' })
  } catch { return }
  try {
    const res = await apiFetch(`/api/v1/admin/upload-tasks/${task.id}`, { method: 'DELETE' })
    if (res.ok) {
      // 关联的未发布成功视频（UPLOADING/FAILED）一并删除，避免悬挂记录
      if (task.videoId) {
        const v = videoList.value.find(x => x.id === task.videoId)
        if (v && (v.status === 'UPLOADING' || v.status === 'FAILED')) {
          await apiFetch(`/api/v1/admin/videos/${task.videoId}`, { method: 'DELETE' }).catch(() => {})
          videoList.value = videoList.value.filter(x => x.id !== task.videoId)
        }
      }
      ElMessage.success('任务已取消，文件已删除')
      fetchUploadTasks()
    } else {
      ElMessage.error('取消失败')
    }
  } catch (e) {
    ElMessage.error('取消失败: ' + e.message)
  }
}

/** 时间格式化（表格用） */
const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const openAddModal = () => {
  isEdit.value = false
  const defaultNode = storageNodes.value.find(n => n.isDefault) || storageNodes.value[0]
  // 新增弹窗：发布策略记忆上次状态（定时发布 → 预填默认下个 UTC+8 00:00）
  const scheduled = getPublishPref()
  videoForm.value = {
    id: '',
    taskId: null,
    title: '',
    description: '',
    author: '官方创作者',
    storageNodeId: defaultNode ? defaultNode.id : 'node-01',
    videoUrl: '',
    referer: '',
    userAgent: DEFAULT_UA,
    poster: '',
    isVip: true,
    previewDuration: 120,
    tags: ['新增'],
    status: scheduled ? 'SCHEDULED' : 'PUBLISHED',
    scheduled,
    publishAtMs: scheduled ? nextUtc8MidnightTs() : null
  }
  modalVisible.value = true
}

/** 任务队列：添加成功后重置表单（保留定时偏好），供连续添加 */
const resetFormForQueue = () => {
  const defaultNode = storageNodes.value.find(n => n.isDefault) || storageNodes.value[0]
  videoForm.value = {
    id: '',
    taskId: null,
    title: '',
    description: '',
    author: '官方创作者',
    storageNodeId: defaultNode ? defaultNode.id : 'node-01',
    videoUrl: '',
    referer: '',
    userAgent: DEFAULT_UA,
    poster: '',
    isVip: true,
    previewDuration: 120,
    tags: ['新增'],
    status: 'SCHEDULED',
    scheduled: true,
    publishAtMs: nextPublishDefaultTs()
  }
}

const openEditModal = (video) => {
  isEdit.value = true
  let refererVal = ''
  let userAgentVal = ''

  if (video.headers) {
    let parsed = {}
    if (typeof video.headers === 'object') {
      parsed = video.headers
    } else {
      try { parsed = JSON.parse(video.headers) } catch {}
    }
    refererVal = parsed['Referer'] || parsed['referer'] || ''
    userAgentVal = parsed['User-Agent'] || parsed['user-agent'] || ''
  }

  videoForm.value = {
    id: video.id,
    taskId: null,
    title: video.title || '',
    description: video.description || '',
    author: video.author || '官方创作者',
    storageNodeId: video.storageNodeId || 'node-01',
    videoUrl: video.videoUrl || '',
    referer: refererVal,
    userAgent: userAgentVal || DEFAULT_UA,
    poster: video.poster || '',
    isVip: !!video.isVip,
    previewDuration: video.previewDuration !== undefined ? Number(video.previewDuration) : 120,
    tags: Array.isArray(video.tags) ? [...video.tags] : [],
    status: video.status || 'PUBLISHED',
    scheduled: video.status === 'SCHEDULED',
    publishAtMs: video.publishAt ? new Date(video.publishAt).getTime() : null
  }
  modalVisible.value = true
}

const handleModalSubmit = async (stagedFile) => {
  const headersJson = buildHeadersJson(videoForm.value.referer, videoForm.value.userAgent)

  // 发布策略：scheduled=true → SCHEDULED；publishAtMs 非空用指定时间，留空不传 publishAt（后端默认下个 UTC+8 00:00）
  // 留空 = 立即发布 → PUBLISHED + publishAt null
  const { publishAtMs, scheduled, ...formFields } = videoForm.value
  const payload = {
    ...formFields,
    publishAt: scheduled
      ? (publishAtMs ? new Date(publishAtMs).toISOString() : undefined)
      : null,
    headers: headersJson
  }

  // 本地文件 → 流程反转：先以 UPLOADING 入库（C 端不可见），后台传输完成自动上线
  if (stagedFile && !isEdit.value) {
    submitLoading.value = true
    try {
      const res = await apiFetch('/api/v1/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'UPLOADING', videoUrl: '' })
      })
      const json = await res.json()
      if (!json.data) {
        ElMessage.error(json.message || '创建视频记录失败')
        return
      }

      const video = json.data
      videoList.value.unshift(video)

      // 任务登记：无 taskId 时自动建占位任务（供取消/展示），并关联 videoId
      let taskId = videoForm.value.taskId
      if (!taskId) {
        try {
          const tRes = await apiFetch('/api/v1/admin/upload-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: stagedFile.name })
          })
          const tJson = await tRes.json()
          if (tRes.ok && tJson.data) taskId = tJson.data.id
        } catch (e) { /* 登记失败不影响发布 */ }
      }
      if (taskId) {
        // await 关联完成后再入队：避免 upload-complete 先于 videoId 关联到达（竞态导致任务残留队列）
        try {
          await apiFetch(`/api/v1/admin/upload-tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: video.id })
          })
        } catch (e) { /* ignore */ }
        fetchUploadTasks()
      }

      // 入队后台传输
      uploadQueue.enqueue({
        videoId: video.id,
        taskId,
        fileName: stagedFile.name,
        file: stagedFile,
        nodeId: videoForm.value.storageNodeId
      })

      modalVisible.value = false
      ElMessage.success(`已直接发布【${video.title}】，文件后台传输中（完成自动上线）`)
      return
    } catch (e) {
      ElMessage.error('发布失败: ' + e.message)
      return
    } finally {
      submitLoading.value = false
    }
  }

  // 计划时间必须晚于当前时间（过去时间 = 立即发布，容易误操作）
  payload.status = scheduled ? 'SCHEDULED' : 'PUBLISHED'
  if (payload.status === 'SCHEDULED' && payload.publishAt && new Date(payload.publishAt).getTime() <= Date.now()) {
    ElMessage.warning('计划发布时间必须晚于当前时间')
    return
  }

  submitLoading.value = true
  try {
    if (isEdit.value) {
      // UPLOADING/FAILED 视频编辑保存：无 URL 不允许转 PUBLISHED（避免空视频泄漏到 C 端）
      if ((videoForm.value.status === 'UPLOADING' || videoForm.value.status === 'FAILED') && !payload.videoUrl) {
        payload.status = videoForm.value.status
      }
      const res = await apiFetch(`/api/v1/admin/videos/${videoForm.value.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.code === 200 && json.data) {
        const index = videoList.value.findIndex(v => v.id === videoForm.value.id)
        if (index !== -1) videoList.value[index] = { ...videoList.value[index], ...json.data }
        modalVisible.value = false
        ElMessage.success(payload.status === 'SCHEDULED' ? '已加入定时发布队列！' : '视频信息更新成功！')
      }
    } else {
      const res = await apiFetch('/api/v1/admin/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.data) {
        videoList.value.unshift(json.data)
        // 任务队列：上传任务 → 已转正式视频
        if (videoForm.value.taskId) {
          apiFetch(`/api/v1/admin/upload-tasks/${videoForm.value.taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed', videoId: json.data.id })
          }).catch(() => {})
          fetchUploadTasks()
        }
        if (payload.status === 'SCHEDULED') {
          // 任务队列：保持弹窗打开，可继续添加下一个
          resetFormForQueue()
          ElMessage.success('已加入发布队列，可继续添加下一个任务')
        } else {
          modalVisible.value = false
          ElMessage.success('视频发布成功！')
        }
      }
    }
  } catch (e) {
    ElMessage.error('操作失败')
  } finally {
    submitLoading.value = false
  }
}

const toggleVipStatus = async (video) => {
  try {
    await apiFetch(`/api/v1/admin/videos/${video.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isVip: video.isVip })
    })
    ElMessage.success(`视频 [${video.title}] 权限修改为: ${video.isVip ? 'VIP专属' : '免费'}`)
  } catch (e) {
    ElMessage.error('更新 VIP 权限失败')
  }
}

const formatPublishTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 立即发布：把 SCHEDULED 队列项直接转为 PUBLISHED */
const publishNow = async (video) => {
  try {
    const res = await apiFetch(`/api/v1/admin/videos/${video.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PUBLISHED', publishAt: null })
    })
    const json = await res.json()
    if (json.code === 200 && json.data) {
      const index = videoList.value.findIndex(v => v.id === video.id)
      if (index !== -1) videoList.value[index] = { ...videoList.value[index], ...json.data }
      ElMessage.success(`视频 [${video.title}] 已立即发布上线`)
    } else {
      ElMessage.error(json.message || '发布失败')
    }
  } catch (e) {
    ElMessage.error('发布失败')
  }
}

const handleDeleteVideo = (id) => {
  ElMessageBox.confirm('确定要彻底删除该视频资源吗？操作不可撤销。', '警告', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await apiFetch(`/api/v1/admin/videos/${id}`, { method: 'DELETE' })
      if (res.ok) {
        videoList.value = videoList.value.filter(v => v.id !== id)
        ElMessage.success('视频资源已成功删除')
      }
    } catch (e) {
      ElMessage.error('删除视频失败')
    }
  })
}
</script>
