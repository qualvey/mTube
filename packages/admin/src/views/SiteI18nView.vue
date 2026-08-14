<template>
  <div class="flex flex-col gap-4 sm:gap-6 max-w-4xl">
    <!-- 新增/编辑覆盖 Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-800">新增/编辑文案覆盖</span>
          <el-tag type="info" size="small">白标定制</el-tag>
        </div>
      </template>

      <el-form label-position="top" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <el-form-item label="i18n key（点路径，如 feed.loadingMore）">
          <el-input v-model.trim="form.key" placeholder="feed.loadingMore" />
        </el-form-item>
        <el-form-item label="中文 (zh)">
          <el-input v-model="form.zh" placeholder="加载更多..." />
        </el-form-item>
        <el-form-item label="English (en)">
          <el-input v-model="form.en" placeholder="Loading more..." />
        </el-form-item>
        <div class="md:col-span-3 flex gap-2">
          <el-button type="warning" class="font-bold" :loading="saving" @click="saveOverride">
            保存覆盖
          </el-button>
          <el-button @click="resetForm">清空</el-button>
          <span class="text-xs text-slate-400 self-center">
            留空的语言保持默认文案；删除覆盖后恢复语言包默认值
          </span>
        </div>
      </el-form>
    </el-card>

    <!-- 已有覆盖列表 Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-800">已有覆盖（{{ rows.length }}）</span>
          <el-button size="small" :loading="loading" @click="fetchOverrides">刷新</el-button>
        </div>
      </template>

      <el-table :data="rows" v-loading="loading" stripe size="small" empty-text="暂无文案覆盖">
        <el-table-column prop="key" label="Key" min-width="180">
          <template #default="{ row }">
            <code class="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{{ row.key }}</code>
          </template>
        </el-table-column>
        <el-table-column label="zh" min-width="160">
          <template #default="{ row }">
            <span v-if="row.zh" class="text-sm">{{ row.zh }}</span>
            <span v-else class="text-sm text-slate-400">默认</span>
          </template>
        </el-table-column>
        <el-table-column label="en" min-width="160">
          <template #default="{ row }">
            <span class="text-sm">{{ row.en || '默认' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="editRow(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeOverride(row)">恢复默认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiFetch } from '../utils/api.js'

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const form = ref({ key: '', zh: '', en: '' })

const fetchOverrides = async () => {
  loading.value = true
  try {
    const res = await apiFetch('/api/v1/admin/site-i18n')
    if (res.ok) {
      const json = await res.json()
      const data = json?.data || {}
      const keys = new Set([...Object.keys(data.zh || {}), ...Object.keys(data.en || {})])
      rows.value = [...keys]
        .sort()
        .map((k) => ({ key: k, zh: data.zh?.[k] || '', en: data.en?.[k] || '' }))
    }
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const saveOverride = async () => {
  const key = form.value.key.trim()
  if (!key) {
    ElMessage.warning('请填写 i18n key')
    return
  }
  saving.value = true
  try {
    let failed = false
    for (const [locale, field] of [['zh', 'zh'], ['en', 'en']]) {
      const value = form.value[field].trim()
      if (!value) continue // 留空 = 不覆盖该语言
      const res = await apiFetch('/api/v1/admin/site-i18n', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, locale, value })
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        ElMessage.error(json?.message || '保存失败')
        failed = true
        break
      }
    }
    if (!failed) {
      ElMessage.success('文案覆盖已保存，C 端刷新即生效')
      resetForm()
      fetchOverrides()
    }
  } catch (e) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const editRow = (row) => {
  form.value = { key: row.key, zh: row.zh, en: row.en }
}

const removeOverride = async (row) => {
  try {
    await ElMessageBox.confirm(`恢复 key「${row.key}」为默认文案？`, '恢复默认', { type: 'warning' })
  } catch {
    return
  }
  let failed = false
  for (const locale of ['zh', 'en']) {
    if (!row[locale]) continue
    const res = await apiFetch(
      `/api/v1/admin/site-i18n?key=${encodeURIComponent(row.key)}&locale=${locale}`,
      { method: 'DELETE' }
    )
    if (!res.ok) failed = true
  }
  if (failed) ElMessage.error('部分删除失败')
  else ElMessage.success('已恢复默认文案')
  fetchOverrides()
}

const resetForm = () => {
  form.value = { key: '', zh: '', en: '' }
}

onMounted(fetchOverrides)
</script>
