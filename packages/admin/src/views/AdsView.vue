<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <!-- Top Action Bar -->
    <div class="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索广告名称..."
          clearable
          prefix-icon="Search"
          class="w-full md:max-w-xs"
        />
        <el-select v-model="typeFilter" placeholder="广告位类型" clearable class="w-full sm:w-44 shrink-0">
          <el-option label="信息流原生 (feed)" value="feed" />
          <el-option label="前贴片 (preroll)" value="preroll" />
          <el-option label="中插 (midroll)" value="midroll" />
        </el-select>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <el-tag v-if="adsEnabled" type="success" size="large" effect="light" class="font-bold justify-center">
          广告投放中（信息流每 {{ adsFeedInterval }} 条插 1 条，仅免费用户可见）
        </el-tag>
        <el-tag v-else type="info" size="large" effect="light" class="justify-center">
          广告总开关未开启（系统设置中启用）
        </el-tag>
        <el-button type="warning" size="large" icon="Plus" class="font-bold" @click="openAddModal">
          新建广告
        </el-button>
      </div>
    </div>

    <!-- Ads List Table Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span class="font-bold text-slate-800">🎯 广告位列表 ({{ filteredAds.length }} 条)</span>
          <el-button size="small" icon="Refresh" @click="fetchAds">刷新</el-button>
        </div>
      </template>

      <div class="admin-table-scroll">
        <el-table :data="filteredAds" style="width: 100%" stripe>
          <el-table-column label="预览" width="110">
            <template #default="{ row }">
              <img
                v-if="row.imageUrl"
                :src="row.imageUrl"
                class="w-20 h-11 rounded-lg object-cover border shadow-sm"
              />
              <div v-else class="w-20 h-11 rounded-lg bg-slate-100 border flex items-center justify-center text-slate-400 text-[10px]">
                无图片
              </div>
            </template>
          </el-table-column>

          <el-table-column label="名称 / 落地页" min-width="220">
            <template #default="{ row }">
              <div class="font-bold text-slate-800 text-sm line-clamp-1">{{ row.title }}</div>
              <a
                v-if="row.linkUrl"
                :href="row.linkUrl"
                target="_blank"
                rel="noopener"
                class="text-xs text-blue-500 hover:underline font-mono line-clamp-1 block mt-0.5"
              >
                {{ row.linkUrl }}
              </a>
            </template>
          </el-table-column>

          <el-table-column label="广告位" width="130">
            <template #default="{ row }">
              <el-tag size="small" :type="row.type === 'feed' ? 'primary' : 'warning'" effect="light">
                {{ typeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="目标人群" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="row.isVip ? 'info' : 'success'" effect="light">
                {{ row.isVip ? '仅免费用户' : '全部用户' }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="投放窗口" width="200">
            <template #default="{ row }">
              <div class="text-xs text-slate-600 font-mono">
                {{ row.startAt ? formatTime(row.startAt) : '不限' }}
                ~
                {{ row.endAt ? formatTime(row.endAt) : '不限' }}
              </div>
            </template>
          </el-table-column>

          <el-table-column label="排序" width="70">
            <template #default="{ row }">
              <span class="font-mono text-xs text-slate-500">{{ row.sortOrder }}</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-switch
                v-model="row.enabled"
                size="small"
                @change="toggleEnabled(row)"
              />
            </template>
          </el-table-column>

          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <el-button size="small" type="primary" plain icon="Edit" @click="openEditModal(row)">编辑</el-button>
                <el-button size="small" type="danger" plain icon="Delete" @click="handleDelete(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="!filteredAds.length" class="text-center py-12 text-slate-400 text-sm">
        暂无广告记录，点击右上角「新建广告」创建第一条
      </div>
    </el-card>

    <!-- Ad Add / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑广告' : '新建广告'"
      width="620px"
      class="responsive-dialog"
    >
      <el-form :model="form" label-position="top">
        <el-form-item label="广告名称" required>
          <el-input v-model="form.title" placeholder="内部标识，例如：618 推广 / 合作方 A" />
        </el-form-item>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <el-form-item label="广告位类型">
            <el-select v-model="form.type" style="width: 100%">
              <el-option label="信息流原生 (feed) - 已接入" value="feed" />
              <el-option label="前贴片 (preroll) - 预留" value="preroll" />
              <el-option label="中插 (midroll) - 预留" value="midroll" />
            </el-select>
          </el-form-item>

          <el-form-item label="目标人群">
            <el-select v-model="form.isVip" style="width: 100%">
              <el-option :value="true" label="仅免费用户（VIP 免广告）" />
              <el-option :value="false" label="全部用户" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="图片素材 URL（信息流卡主图）">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <el-input v-model="form.imageUrl" placeholder="https://.../ad.jpg 或 /uploads/..." />
            <input
              type="file"
              ref="imageFileInput"
              accept="image/*"
              class="hidden"
              @change="handleImageUpload($event)"
            />
            <el-button
              type="primary"
              plain
              icon="Upload"
              :loading="imageUploading"
              @click="$refs.imageFileInput.click()"
            >
              {{ imageUploading ? '上传中...' : '上传本地图片' }}
            </el-button>
          </div>
        </el-form-item>

        <el-form-item label="视频素材 URL（前贴片/中插预留）">
          <el-input v-model="form.videoUrl" placeholder="https://.../ad.mp4（当前未接入播放器，可留空）" />
        </el-form-item>

        <el-form-item label="落地页 URL（点击跳转）">
          <el-input v-model="form.linkUrl" placeholder="https://..." />
        </el-form-item>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <el-form-item label="投放开始时间（留空 = 不限）">
            <el-date-picker
              v-model="form.startAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
              placeholder="开始投放"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="投放结束时间（留空 = 不限）">
            <el-date-picker
              v-model="form.endAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
              placeholder="结束投放"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <el-form-item label="排序权重（数字越小越靠前）">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="warning" class="font-bold" :loading="saving" @click="handleSave">
            {{ isEdit ? '保存修改' : '创建广告' }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiFetch } from '../utils/api.js'

const ads = ref([])
const adsEnabled = ref(false)
const adsFeedInterval = ref(6)
const searchKeyword = ref('')
const typeFilter = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

const emptyForm = () => ({
  id: '',
  title: '',
  type: 'feed',
  imageUrl: '',
  videoUrl: '',
  linkUrl: '',
  isVip: true,
  enabled: true,
  startAt: null,
  endAt: null,
  sortOrder: 0
})

const form = ref(emptyForm())
const imageFileInput = ref(null)
const imageUploading = ref(false)

/** 广告主图：multipart 直传主控（复用 /api/v1/upload） */
const handleImageUpload = (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }
  imageUploading.value = true
  const upload = async () => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/v1/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (res.ok && json.data && json.data.url) {
        form.value.imageUrl = json.data.url
        ElMessage.success(`图片上传成功！路径: ${json.data.url}`)
      } else {
        ElMessage.error(json.message || '图片上传失败')
      }
    } catch (err) {
      ElMessage.error('图片上传失败: ' + err.message)
    } finally {
      imageUploading.value = false
    }
  }
  upload()
}

const fetchAds = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/ads')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) ads.value = json.data
    }
  } catch (e) {
    ElMessage.error('获取广告列表失败')
  }
}

const fetchSettings = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/settings')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        adsEnabled.value = json.data.adsEnabled === true || json.data.adsEnabled === 'true'
        adsFeedInterval.value = Number(json.data.adsFeedInterval) || 6
      }
    }
  } catch (e) {}
}

onMounted(() => {
  fetchAds()
  fetchSettings()
})

const filteredAds = computed(() => {
  return ads.value.filter(a => {
    const matchKeyword = !searchKeyword.value || (a.title && a.title.toLowerCase().includes(searchKeyword.value.toLowerCase()))
    const matchType = !typeFilter.value || a.type === typeFilter.value
    return matchKeyword && matchType
  })
})

const typeLabel = (type) => ({
  feed: '信息流原生',
  preroll: '前贴片',
  midroll: '中插'
}[type] || type)

const formatTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const openAddModal = () => {
  isEdit.value = false
  form.value = emptyForm()
  dialogVisible.value = true
}

const openEditModal = (ad) => {
  isEdit.value = true
  form.value = {
    id: ad.id,
    title: ad.title || '',
    type: ad.type || 'feed',
    imageUrl: ad.imageUrl || '',
    videoUrl: ad.videoUrl || '',
    linkUrl: ad.linkUrl || '',
    isVip: !!ad.isVip,
    enabled: ad.enabled !== false,
    startAt: ad.startAt || null,
    endAt: ad.endAt || null,
    sortOrder: Number(ad.sortOrder) || 0
  }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.value.title) {
    ElMessage.warning('请填写广告名称')
    return
  }
  // 拒绝 base64 粘贴入库（应走上传按钮）
  if (form.value.imageUrl && form.value.imageUrl.startsWith('data:')) {
    ElMessage.warning('图片素材不能直接粘贴 base64，请使用「上传本地图片」按钮')
    return
  }
  saving.value = true
  try {
    const body = { ...form.value }
    delete body.id
    const res = isEdit.value
      ? await apiFetch(`/api/v1/admin/ads/${form.value.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
      : await apiFetch('/api/v1/admin/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
    const json = await res.json()
    if (res.ok && json.code < 300) {
      ElMessage.success(isEdit.value ? '广告已更新' : '广告已创建')
      dialogVisible.value = false
      fetchAds()
    } else {
      ElMessage.error(json.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const toggleEnabled = async (ad) => {
  try {
    await apiFetch(`/api/v1/admin/ads/${ad.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: ad.enabled })
    })
    ElMessage.success(`广告 [${ad.title}] 已${ad.enabled ? '启用' : '停用'}`)
  } catch (e) {
    ad.enabled = !ad.enabled
    ElMessage.error('操作失败')
  }
}

const handleDelete = (ad) => {
  ElMessageBox.confirm(`确定删除广告 [${ad.title}] 吗？`, '警告', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await apiFetch(`/api/v1/admin/ads/${ad.id}`, { method: 'DELETE' })
      if (res.ok) {
        ads.value = ads.value.filter(a => a.id !== ad.id)
        ElMessage.success('广告已删除')
      }
    } catch (e) {
      ElMessage.error('删除失败')
    }
  })
}
</script>
