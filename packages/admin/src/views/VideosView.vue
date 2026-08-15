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

        <el-table-column label="发布状态" width="150">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'SCHEDULED'" type="warning" size="small" effect="light" class="font-bold">
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
      @submit="handleModalSubmit"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import VideoUploadModal from '../components/VideoUploadModal.vue'
import { DEFAULT_UA, buildHeadersJson } from '../utils/formatters.js'
import { getPublishPref, nextUtc8MidnightTs, nextPublishDefaultTs } from '../utils/publishPref.js'
import { apiFetch } from '../utils/api.js'

const videoList = ref([])
const storageNodes = ref([])
const searchKeyword = ref('')
const selectedNodeFilter = ref('')
const enableDirectUpload = ref(true)

const modalVisible = ref(false)
const isEdit = ref(false)
const videoForm = ref({
  id: '',
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

const openAddModal = () => {
  isEdit.value = false
  const defaultNode = storageNodes.value.find(n => n.isDefault) || storageNodes.value[0]
  // 新增弹窗：发布策略记忆上次状态（定时发布 → 预填默认下个 UTC+8 00:00）
  const scheduled = getPublishPref()
  videoForm.value = {
    id: '',
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
    title: '',
    description: '',
    author: '?????',
    storageNodeId: defaultNode ? defaultNode.id : 'node-01',
    videoUrl: '',
    referer: '',
    userAgent: DEFAULT_UA,
    poster: '',
    isVip: true,
    previewDuration: 120,
    tags: ['??'],
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

const handleModalSubmit = async () => {
  const headersJson = buildHeadersJson(videoForm.value.referer, videoForm.value.userAgent)

  // 发布策略：scheduled=true → SCHEDULED；publishAtMs 非空用指定时间，留空不传 publishAt（后端默认下个 UTC+8 00:00）
  // 留空 = 立即发布 → PUBLISHED + publishAt null
  const { publishAtMs, scheduled, ...formFields } = videoForm.value
  const payload = {
    ...formFields,
    publishAt: scheduled
      ? (publishAtMs ? new Date(publishAtMs).toISOString() : undefined)
      : null,
    status: scheduled ? 'SCHEDULED' : 'PUBLISHED',
    headers: headersJson
  }

  // 计划时间必须晚于当前时间（过去时间 = 立即发布，容易误操作）
  if (payload.status === 'SCHEDULED' && payload.publishAt && new Date(payload.publishAt).getTime() <= Date.now()) {
    ElMessage.warning('计划发布时间必须晚于当前时间')
    return
  }

  try {
    if (isEdit.value) {
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
