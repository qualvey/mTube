<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑视频资源信息' : '发布全新视频资源'"
    width="640px"
    class="responsive-dialog"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="视频标题" required>
        <el-input v-model="form.title" placeholder="例如：【4K原画】独家高能剪辑" />
      </el-form-item>

      <el-form-item label="视频描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="详细视频简介" />
      </el-form-item>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <el-form-item label="创作者名称">
          <el-input v-model="form.author" placeholder="官方创作者" />
        </el-form-item>

        <el-form-item label="默认分配存储节点">
          <el-select v-model="form.storageNodeId" placeholder="选择存储节点" style="width: 100%">
            <el-option
              v-for="node in storageNodes"
              :key="node.id"
              :label="`${node.name} (${node.id})${node.isDefault ? ' ⭐[默认]' : ''}`"
              :value="node.id"
            />
          </el-select>
        </el-form-item>
      </div>

      <!-- 视频来源：本地文件（发布后后台传输）或 手动播放地址，二选一 -->
      <el-form-item required>
        <template #label>
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
            <span>视频文件（后台上传）或 MP4 / M3U8 播放地址</span>
            <el-tag v-if="enableDirectUpload" type="success" size="small" effect="light" class="font-bold">
              ⚡ 浏览器直传模式 (零主控带宽开销)
            </el-tag>
            <el-tag v-else type="info" size="small" effect="light">
              📦 主控中转模式
            </el-tag>
          </div>
        </template>

        <!-- 本地文件：选择后先入发布队列，点发布后在后台传输 -->
        <div class="flex flex-col gap-2 w-full">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <el-input v-model="form.videoUrl" placeholder="https://.../video.mp4 或 /uploads/... 或 YouTube 链接" />
            <input
              type="file"
              ref="videoFileInput"
              accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.flv,.wmv,.m4v"
              class="hidden"
              @change="handleVideoFileSelect($event)"
            />
            <el-button
              type="primary"
              plain
              icon="Upload"
              class="mobile-full-button"
              @click="$refs.videoFileInput.click()"
            >
              {{ stagedFile ? '重新选择文件' : '选择本地视频' }}
            </el-button>
          </div>

          <!-- 已选文件卡片：发布后进入后台传输队列 -->
          <div v-if="stagedFile" class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-emerald-800 truncate">🎬 {{ stagedFile.name }}</span>
              <el-button size="small" text type="danger" @click="clearStagedFile">移除</el-button>
            </div>
            <div class="text-[11px] text-emerald-700 font-mono">{{ formatBytes(stagedFile.size) }}</div>
            <div class="text-[11px] text-amber-700 font-bold">
              ⏳ 点「直接发布」后立即入库（后台传输，不阻塞发布），上传完成自动上线
            </div>
            <div v-if="fileWarnings.length" class="text-[11px] text-amber-700 font-bold">
              <div v-for="(w, i) in fileWarnings" :key="i">⚠️ {{ w }}</div>
            </div>
          </div>

          <div v-else-if="form.videoUrl" class="text-[11px] text-slate-400">
            已填写播放地址，将直接发布（不走后台传输）
          </div>
        </div>

        <!-- 试播预览（编辑模式）：验证地址可播性；防盗链 Referer/UA 需在 C 端验证（浏览器标签无法自定义请求头） -->
        <div v-if="isEdit && form.videoUrl" class="mt-1 p-3 bg-slate-900 rounded-xl flex flex-col gap-1.5">
          <video
            :src="form.videoUrl"
            controls
            preload="metadata"
            class="w-full rounded-lg bg-black"
            style="max-height: 240px"
          >
            当前浏览器不支持视频预览
          </video>
          <div class="text-[11px] text-slate-400">
            🎬 试播预览：仅验证地址可播性。防盗链 Referer/User-Agent 请求头在浏览器标签内无法自定义，
            实际防盗链效果请在 C 端播放页验证（已配置的请求头会随视频播放请求下发）。
          </div>
        </div>
      </el-form-item>

      <!-- Predefined Request Headers UI Component Block -->
      <div class="p-4 border border-amber-200 bg-amber-50/50 rounded-xl flex flex-col gap-3 my-2">
        <div class="text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <span>🔒 自定义请求头配置 (Predefined Request Headers)</span>
        </div>

        <el-form-item label="Referer (防盗链来源页)">
          <el-input
            v-model="form.referer"
            placeholder="例如：https://missav.ws/dm48/cn/bf-720-uncensored-leak"
          />
        </el-form-item>

        <el-form-item label="User-Agent (客户端签名)">
          <el-input
            v-model="form.userAgent"
            type="textarea"
            :rows="2"
            :placeholder="DEFAULT_UA"
          />
          <div class="text-[11px] text-slate-500 mt-1">
            提示：若为空则默认使用：<code class="text-amber-800 bg-amber-100/80 px-1 py-0.5 rounded font-mono">{{ DEFAULT_UA }}</code>
          </div>
        </el-form-item>
      </div>

      <el-form-item label="封面图片地址">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <el-input v-model="form.poster" placeholder="https://.../poster.jpg 或 /uploads/...（留空则自动截取视频第50帧）" />
          <input
            type="file"
            ref="posterFileInput"
            accept="image/*"
            class="hidden"
            @change="handlePosterUpload($event)"
          />
          <el-button
            type="primary"
            plain
            icon="Upload"
            :loading="posterUploading"
            class="mobile-full-button"
            @click="$refs.posterFileInput.click()"
          >
            {{ posterUploading ? '上传中...' : '上传本地封面' }}
          </el-button>
        </div>
      </el-form-item>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <el-form-item label="视频分类标签 (Tags)">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入新标签"
            style="width: 100%"
          >
            <el-option
              v-for="item in availableTags"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="VIP 专属限制">
          <el-switch v-model="form.isVip" active-text="仅 VIP 可播放" inactive-text="免费公开试看" />
        </el-form-item>
      </div>

      <el-form-item v-if="form.isVip" label="VIP 试看时长限制 (秒)">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
          <el-input-number v-model="form.previewDuration" :min="10" :max="3600" :step="10" />
          <span class="text-xs text-slate-500">
            (默认 120 秒 / 2 分钟，试看超时后自动暂停并弹窗锁屏)
          </span>
        </div>
      </el-form-item>

      <el-form-item label="发布策略">
        <div class="flex flex-col gap-2 w-full">
          <div class="flex items-center justify-between w-full">
            <span class="text-sm font-bold text-slate-700 flex items-center gap-1.5">⏰ 定时发布</span>
            <el-switch v-model="form.scheduled" />
          </div>
          <template v-if="form.scheduled">
            <el-date-picker
              v-model="form.publishAtMs"
              type="datetime"
              placeholder="不选择则默认下个北京时间零点自动上线"
              :disabled-date="disabledPublishDate"
              style="width: 100%"
            />
            <span v-if="form.publishAtMs" class="text-xs text-amber-600 font-bold">
              ⏰ 将加入定时发布队列：{{ formatPublishTime(form.publishAtMs) }} 后主站可见
            </span>
            <span v-else class="text-xs text-slate-400">
              未指定时间，提交后默认下个 当前时间之后任意时刻（北京时间零点）自动发布上线
            </span>
          </template>
          <span v-else class="text-xs text-slate-400">
            关闭 = 提交后立即在主站上线（本地文件则上传完成后立即上线）
          </span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <el-button class="mobile-full-button" @click="$emit('update:visible', false)">取消</el-button>
        <el-button
          type="warning"
          class="font-bold mobile-full-button"
          @click="handleSubmit"
        >
          {{ isEdit ? '保存更新' : (stagedFile ? '直接发布（后台传输）' : '立即提交发布') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_UA, formatBytes } from '../utils/formatters.js'
import { savePublishPref, nextPublishDefaultTs } from '../utils/publishPref.js'
import { apiFetch } from '../utils/api.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  isEdit: { type: Boolean, default: false },
  form: { type: Object, required: true },
  storageNodes: { type: Array, default: () => [] },
  availableTags: { type: Array, default: () => [] },
  enableDirectUpload: { type: Boolean, default: true }
})

const emit = defineEmits(['update:visible', 'submit'])

const videoFileInput = ref(null)
const posterFileInput = ref(null)

const posterUploading = ref(false)

/** 已选待后台传输的本地文件（发布时随 submit 一起提交给父组件入队） */
const stagedFile = ref(null)
const fileWarnings = ref([])

const VIDEO_EXT_WHITELIST = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'flv', 'wmv', 'm4v', 'ts']
const MAX_SINGLE_UPLOAD = 2 * 1024 * 1024 * 1024 // 存储节点单文件上限 2GB（超过必须走切片直传）

watch(() => props.visible, (newVal) => {
  if (newVal) {
    stagedFile.value = null
    fileWarnings.value = []
  }
})

/** 选择本地视频：仅预检 + 暂存，不立即上传（发布后由上传队列后台传输） */
const handleVideoFileSelect = (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return

  const warnings = []
  const ext = (file.name.split('.').pop() || '').toLowerCase()

  if (!VIDEO_EXT_WHITELIST.includes(ext)) {
    ElMessage.error(`不支持的视频格式 .${ext || '未知'}，支持: ${VIDEO_EXT_WHITELIST.join('/')}`)
    return
  }
  if (file.size <= 0) {
    ElMessage.error('文件为空，请重新选择')
    return
  }
  if (file.size >= MAX_SINGLE_UPLOAD) {
    warnings.push(`文件超过 ${formatBytes(MAX_SINGLE_UPLOAD)}，将使用切片直传（自动分片，不受大小限制）`)
  } else if (file.size >= 100 * 1024 * 1024) {
    warnings.push('文件较大，请确保直传模式开启（可绕过 Cloudflare 100MB 限制）')
  }

  stagedFile.value = file
  fileWarnings.value = warnings
  ElMessage.success(`已选择文件：${file.name}（${formatBytes(file.size)}），发布后后台传输`)
}

const clearStagedFile = () => {
  stagedFile.value = null
  fileWarnings.value = []
}

/** 封面小图：仍走主控 base64 直传（图片小，无性能问题） */
const handlePosterUpload = (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }

  posterUploading.value = true
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const base64Data = e.target.result
      const res = await apiFetch('/api/v1/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, fileData: base64Data })
      })
      const json = await res.json()
      if (res.ok && json.data && json.data.url) {
        props.form.poster = json.data.url
        ElMessage.success(`图片上传成功！路径: ${json.data.url}`)
      } else {
        ElMessage.error(json.message || '图片上传失败')
      }
    } catch (err) {
      ElMessage.error('图片上传失败: ' + err.message)
    } finally {
      posterUploading.value = false
    }
  }
  reader.onerror = () => {
    posterUploading.value = false
    ElMessage.error('图片读取失败')
  }
  reader.readAsDataURL(file)
}

/** 定时发布：禁止选择过去时间 */
const disabledPublishDate = (date) => {
  // datetime 面板回调为当天 00:00，不能按 Date.now() 判断（会把当天一起禁掉）
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return date.getTime() < todayStart.getTime()
}

// 切换发布策略：即时记忆偏好；定时且未指定时间 → 自动预填默认零点；切回立即发布 → 清空时间
watch(
  () => props.form.scheduled,
  (scheduled) => {
    savePublishPref(scheduled)
    if (scheduled && !props.form.publishAtMs) {
      props.form.publishAtMs = nextPublishDefaultTs()
    } else if (!scheduled) {
      props.form.publishAtMs = null
    }
  }
)

/** 本地时间戳 → 可读时间 */
const formatPublishTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const handleSubmit = () => {
  if (!props.form.title) {
    ElMessage.warning('请填写视频标题')
    return
  }
  if (!props.form.videoUrl && !stagedFile.value) {
    ElMessage.warning('请选择本地视频文件，或填写视频播放地址')
    return
  }
  if (!props.isEdit && stagedFile.value) {
    props.form.videoUrl = '' // 本地文件走后台传输，清掉可能残留的旧 URL
  }
  emit('submit', !props.isEdit ? (stagedFile.value || null) : null)
}
</script>
