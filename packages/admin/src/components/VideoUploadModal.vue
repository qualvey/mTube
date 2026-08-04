<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑视频资源信息' : '发布全新视频资源'"
    width="640px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" label-position="top">
      <el-form-item label="视频标题" required>
        <el-input v-model="form.title" placeholder="例如：【4K原画】独家高能剪辑" />
      </el-form-item>

      <el-form-item label="视频描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="详细视频简介" />
      </el-form-item>

      <div class="grid grid-cols-2 gap-4">
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

      <el-form-item required>
        <template #label>
          <div class="flex items-center justify-between w-full">
            <span>视频 MP4 / M3U8 播放地址</span>
            <el-tag v-if="enableDirectUpload" type="success" size="small" effect="light" class="font-bold">
              ⚡ 浏览器直传模式 (零主控带宽开销)
            </el-tag>
            <el-tag v-else type="info" size="small" effect="light">
              📦 主控中转模式
            </el-tag>
          </div>
        </template>
        <div class="flex items-center gap-2">
          <el-input v-model="form.videoUrl" placeholder="https://.../video.mp4 或 /uploads/... 或 YouTube 链接" />
          <input
            type="file"
            ref="videoFileInput"
            accept="video/*,.m3u8,.mp4,.mov,.webm"
            class="hidden"
            @change="handleFileUpload($event, 'videoUrl')"
          />
          <el-button
            type="primary"
            plain
            icon="Upload"
            :loading="uploadLoading"
            @click="$refs.videoFileInput.click()"
          >
            上传本地视频
          </el-button>
        </div>

        <!-- Real-time Video Upload Progress & Transfer Speed Indicator -->
        <div v-if="uploadLoading || uploadProgress > 0" class="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 shadow-inner w-full">
          <div class="flex items-center justify-between text-xs font-bold text-slate-700">
            <span class="flex items-center gap-1.5">
              <span class="text-amber-500 animate-pulse">🚀</span>
              <span>{{ uploadStatusLabel || '视频传输处理中...' }}</span>
            </span>
            <span class="font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
              ⚡ {{ uploadSpeed }}
            </span>
          </div>
          <el-progress
            :percentage="uploadProgress"
            :status="uploadProgress === 100 ? 'success' : ''"
            :stroke-width="8"
            striped
            striped-flow
          />
          <div class="flex items-center justify-between text-[11px] font-mono text-slate-500">
            <span>已传输: {{ uploadDetailText }}</span>
            <span>进度: {{ uploadProgress }}%</span>
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
        <div class="flex items-center gap-2">
          <el-input v-model="form.poster" placeholder="https://.../poster.jpg 或 /uploads/..." />
          <input
            type="file"
            ref="posterFileInput"
            accept="image/*"
            class="hidden"
            @change="handleFileUpload($event, 'poster')"
          />
          <el-button
            type="primary"
            plain
            icon="Upload"
            :loading="uploadLoading"
            @click="$refs.posterFileInput.click()"
          >
            上传本地封面
          </el-button>
        </div>
      </el-form-item>

      <div class="grid grid-cols-2 gap-4">
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
        <el-input-number v-model="form.previewDuration" :min="10" :max="3600" :step="10" />
        <span class="text-xs text-slate-500 ml-2">
          (默认 120 秒 / 2 分钟，试看超时后自动暂停并弹窗锁屏)
        </span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button
        type="warning"
        class="font-bold"
        :loading="uploadLoading || submitLoading"
        :disabled="uploadLoading || submitLoading"
        @click="handleSubmit"
      >
        {{ uploadLoading ? '视频传输中...' : isEdit ? '保存更新' : '立即提交发布' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DEFAULT_UA, formatBytes } from '../utils/formatters.js'
import { uploadFileWithProgress, uploadFileParallelChunks } from '../utils/uploader.js'

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

const uploadLoading = ref(false)
const submitLoading = ref(false)
const uploadProgress = ref(0)
const uploadSpeed = ref('0 KB/s')
const uploadDetailText = ref('')
const uploadStatusLabel = ref('')

watch(() => props.visible, (newVal) => {
  if (newVal) {
    uploadLoading.value = false
    uploadProgress.value = 0
    uploadSpeed.value = '0 KB/s'
    uploadDetailText.value = ''
    uploadStatusLabel.value = ''
  }
})

const handleFileUpload = async (event, fieldName) => {
  const file = event.target.files[0]
  if (!file) return

  uploadLoading.value = true
  uploadProgress.value = 0
  uploadSpeed.value = '0 KB/s'
  uploadDetailText.value = `0 B / ${formatBytes(file.size)}`
  uploadStatusLabel.value = '准备上传...'

  const stateRefs = { uploadProgress, uploadSpeed, uploadDetailText, uploadStatusLabel }

  try {
    const isVideo = file.type.startsWith('video/') || fieldName === 'videoUrl'

    if (isVideo) {
      let uploadSuccess = false

      if (props.enableDirectUpload) {
        try {
          uploadStatusLabel.value = '⚡ [直传模式] 正在获取存储节点直传凭证...'
          const ticketRes = await fetch('/api/v1/admin/videos/upload-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeId: props.form.storageNodeId })
          })
          const ticketJson = await ticketRes.json()

          if (ticketRes.ok && ticketJson.data && ticketJson.data.uploadUrl) {
            const ticket = ticketJson.data
            if (ticket.chunkUploadUrl && ticket.mergeUrl && file.size >= 5 * 1024 * 1024) {
              uploadStatusLabel.value = `⚡ [4并发直传] 传输至 [${ticket.storageNodeName || ticket.storageNodeId}]`
              const result = await uploadFileParallelChunks(ticket, file, stateRefs)
              const directJson = result.data

              if (result.ok && directJson.data && directJson.data.videoUrl) {
                props.form[fieldName] = directJson.data.videoUrl
                if (ticket.storageNodeId) props.form.storageNodeId = ticket.storageNodeId
                if (directJson.data.posterUrl && !props.form.poster) props.form.poster = directJson.data.posterUrl
                ElMessage.success(`⚡ [4通道并发直传成功] 已自动关联播放地址：${directJson.data.videoUrl}`)
                uploadSuccess = true
              }
            } else {
              const directFormData = new FormData()
              directFormData.append('video', file)
              uploadStatusLabel.value = `⚡ [直传模式] 传输至 [${ticket.storageNodeName || ticket.storageNodeId}]`

              const result = await uploadFileWithProgress(ticket.uploadUrl, directFormData, ticket.headers || {}, stateRefs)
              const directJson = result.data

              if (result.ok && directJson.data && directJson.data.videoUrl) {
                props.form[fieldName] = directJson.data.videoUrl
                if (ticket.storageNodeId) props.form.storageNodeId = ticket.storageNodeId
                if (directJson.data.posterUrl && !props.form.poster) props.form.poster = directJson.data.posterUrl
                ElMessage.success(`⚡ [直传成功] 已自动关联播放地址：${directJson.data.videoUrl}`)
                uploadSuccess = true
              }
            }
          }
        } catch (directErr) {
          console.warn('[Direct Upload] Direct upload failed, falling back to proxy upload:', directErr.message)
        }
      }

      if (!uploadSuccess) {
        uploadProgress.value = 0
        uploadSpeed.value = '0 KB/s'
        uploadStatusLabel.value = '📦 [中转模式] 上传至主控服务器中转...'

        const formData = new FormData()
        formData.append('video', file)
        if (props.form.storageNodeId) formData.append('nodeId', props.form.storageNodeId)

        try {
          const result = await uploadFileWithProgress('/api/v1/admin/videos/upload', formData, {}, stateRefs)
          const json = result.data

          if (result.ok && json.data && json.data.videoUrl) {
            props.form[fieldName] = json.data.videoUrl
            if (json.data.storageNodeId) props.form.storageNodeId = json.data.storageNodeId
            if (json.data.posterUrl && !props.form.poster) props.form.poster = json.data.posterUrl
            ElMessage.success(`视频上传完成！已关联播放地址：${json.data.videoUrl}`)
          } else {
            ElMessage.error(json.message || '存储节点上传失败')
          }
        } catch (proxyErr) {
          ElMessage.error('上传失败: ' + proxyErr.message)
        }
      }
    } else {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Data = e.target.result
        const res = await fetch('/api/v1/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64Data })
        })
        const json = await res.json()
        if (res.ok && json.data && json.data.url) {
          props.form[fieldName] = json.data.url
          ElMessage.success(`图片上传成功！路径: ${json.data.url}`)
        } else {
          ElMessage.error(json.message || '图片上传失败')
        }
        uploadLoading.value = false
      }
      reader.readAsDataURL(file)
      return
    }
  } catch (err) {
    ElMessage.error('上传读取异常: ' + err.message)
  } finally {
    uploadLoading.value = false
    event.target.value = ''
  }
}

const handleSubmit = () => {
  if (uploadLoading.value) {
    ElMessage.warning('视频仍在传输或拼接处理中，请稍候再提交')
    return
  }
  if (!props.form.title) {
    ElMessage.warning('请填写视频标题')
    return
  }
  if (!props.form.videoUrl) {
    ElMessage.warning('请先成功上传本地视频或手动填写视频播放地址')
    return
  }
  emit('submit')
}
</script>
