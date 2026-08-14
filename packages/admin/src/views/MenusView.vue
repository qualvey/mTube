<template>
  <div class="flex flex-col gap-4 sm:gap-6">
    <!-- Top Action Bar -->
    <div class="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索菜单名称..."
          clearable
          prefix-icon="Search"
          class="w-full md:max-w-xs"
        />
        <el-select v-model="typeFilter" placeholder="菜单类型" clearable class="w-full sm:w-44 shrink-0">
          <el-option label="视频分类 (category)" value="category" />
          <el-option label="链接跳转 (link)" value="link" />
          <el-option label="内置页 (page)" value="page" />
          <el-option label="分组 (group)" value="group" />
        </el-select>
      </div>
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <el-tag type="info" size="large" effect="light" class="justify-center">
          C 端未配置菜单时自动展示默认菜单（全部视频 + 最热 tag）
        </el-tag>
        <el-button type="warning" size="large" icon="Plus" class="font-bold mobile-full-button" @click="openAddModal">
          新建菜单
        </el-button>
      </div>
    </div>

    <!-- Menus List Table Card -->
    <el-card class="rounded-2xl shadow-sm border-slate-200">
      <template #header>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span class="font-bold text-slate-800">🧭 全站导航菜单 (共 {{ menus.length }} 项)</span>
          <el-button size="small" icon="Refresh" @click="fetchMenus">刷新</el-button>
        </div>
      </template>

      <div class="admin-table-scroll">
        <el-table
          :data="menuTree"
          style="width: 100%"
          stripe
          row-key="id"
          :tree-props="{ children: 'children' }"
          default-expand-all
        >
          <el-table-column label="菜单名称" min-width="200">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <span v-if="row.icon" class="text-base">{{ row.icon }}</span>
                <span class="font-bold text-slate-800 text-sm">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="类型" width="130">
            <template #default="{ row }">
              <el-tag size="small" :type="typeTagType(row.type)" effect="light" class="font-mono font-bold">
                {{ typeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="目标配置" min-width="220">
            <template #default="{ row }">
              <span v-if="row.type === 'category'" class="text-xs text-slate-500 font-mono">
                {{ row.target.tags && row.target.tags.length ? row.target.tags.join(' + ') : '全部视频' }}
              </span>
              <span v-else-if="row.type === 'link'" class="text-xs text-slate-500 font-mono">{{ row.target.url || '—' }}</span>
              <span v-else-if="row.type === 'page'" class="text-xs text-slate-500 font-mono">{{ row.target.pageKey || '—' }}</span>
              <span v-else class="text-xs text-slate-400">—</span>
            </template>
          </el-table-column>

          <el-table-column label="排序" width="70" align="center">
            <template #default="{ row }">
              <span class="font-mono text-xs text-slate-600">{{ row.sortOrder }}</span>
            </template>
          </el-table-column>

          <el-table-column label="启用" width="80" align="center">
            <template #default="{ row }">
              <el-switch
                :model-value="row.enabled"
                size="small"
                @change="(val) => toggleEnabled(row, val)"
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

      <div v-if="!menus.length" class="text-center py-12 text-slate-400 text-sm">
        暂无菜单配置，C 端将展示默认菜单（全部视频 + 最热 tag）
      </div>
    </el-card>

    <!-- Menu Add / Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑菜单' : '新建菜单'"
      width="600px"
      class="responsive-dialog"
    >
      <el-form :model="form" label-position="top">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <el-form-item label="菜单名称" required>
            <el-input v-model="form.name" placeholder="例如：热门推荐 / VIP 专区" />
          </el-form-item>

          <el-form-item label="菜单类型" required>
            <el-select v-model="form.type" style="width: 100%" @change="onTypeChange">
              <el-option label="视频分类 (category) — 点击后按绑定 tag 过滤视频" value="category" />
              <el-option label="链接跳转 (link) — 跳转内置路由页面" value="link" />
              <el-option label="内置页 (page) — 预留：打开前端内置页面" value="page" />
              <el-option label="分组 (group) — 预留：纯分组标题" value="group" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item v-if="form.type === 'category'" label="绑定视频标签 (Tags)">
          <div class="flex flex-col gap-1 w-full">
            <el-select
              v-model="form.target.tags"
              multiple
              filterable
              clearable
              placeholder="留空 = 全部视频；选择后该菜单点击只显示对应标签的视频"
              style="width: 100%"
            >
              <el-option
                v-for="tag in tagOptions"
                :key="tag.name"
                :label="`${tag.name} (${tag.count})`"
                :value="tag.name"
              />
            </el-select>
            <span class="text-[11px] text-slate-500">可从上方标签中选择，也支持输入回车创建新标签名</span>
          </div>
        </el-form-item>

        <el-form-item v-else-if="form.type === 'link'" label="跳转地址 (URL)">
          <el-input v-model="form.target.url" placeholder="例如：/video/xxx 或站内路由路径" />
          <span class="text-[11px] text-slate-500 mt-1">站内路由路径，如首页 /、视频详情 /video/:id</span>
        </el-form-item>

        <el-form-item v-else-if="form.type === 'page'" label="页面标识 (pageKey)">
          <el-input v-model="form.target.pageKey" placeholder="预留：如 settings / about" disabled />
          <span class="text-[11px] text-slate-500 mt-1">预留字段，前端内置页上线后生效</span>
        </el-form-item>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <el-form-item label="上级菜单">
            <el-select v-model="form.parentId" placeholder="无（顶级菜单）" clearable style="width: 100%">
              <el-option
                v-for="item in topLevelMenus"
                :key="item.id"
                :label="item.name"
                :value="item.id"
                :disabled="item.id === form.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="图标 (emoji)">
            <el-input v-model="form.icon" placeholder="如 ▶ / 🔥" maxlength="4" />
          </el-form-item>

          <el-form-item label="排序 (数字越小越靠前)">
            <el-input-number v-model="form.sortOrder" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
        </div>

        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          <span class="text-[11px] text-slate-500 ml-2">停用后 C 端不再展示该菜单</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <el-button class="mobile-full-button" @click="dialogVisible = false">取消</el-button>
          <el-button type="warning" class="font-bold mobile-full-button" :loading="saving" @click="handleSubmit">
            {{ isEdit ? '保存修改' : '创建菜单' }}
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

const menus = ref([])
const tagOptions = ref([])
const searchKeyword = ref('')
const typeFilter = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

const emptyForm = () => ({
  id: '',
  parentId: null,
  name: '',
  type: 'category',
  target: { tags: [] },
  icon: '',
  sortOrder: 0,
  enabled: true
})

const form = ref(emptyForm())

const typeLabel = (type) => ({
  category: '分类',
  link: '链接',
  page: '页面',
  group: '分组'
}[type] || type)

const typeTagType = (type) => ({
  category: 'warning',
  link: 'primary',
  page: 'success',
  group: 'info'
}[type] || 'info')

/** 组装树（管理端接口返回扁平列表） */
const menuTree = computed(() => {
  const nodeMap = new Map()
  menus.value.forEach(m => nodeMap.set(m.id, { ...m, children: [] }))
  const tree = []
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId).children.push(node)
    } else {
      tree.push(node)
    }
  }
  return tree
})

/** 顶级菜单（可选作父级；排除自己与自己的子级避免环） */
const topLevelMenus = computed(() => {
  const ids = new Set()
  const collect = (list) => {
    for (const m of list) {
      ids.add(m.id)
      collect(m.children || [])
    }
  }
  collect(menuTree.value)
  return menus.value.filter(m => !m.parentId || !ids.has(m.parentId))
})

const fetchMenus = async () => {
  try {
    const res = await apiFetch('/api/v1/admin/menus')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data) {
        menus.value = json.data
        return
      }
    }
    ElMessage.error('获取菜单列表失败')
  } catch (e) {
    ElMessage.error('获取菜单列表失败: ' + e.message)
  }
}

const fetchTagOptions = async () => {
  try {
    const res = await fetch('/api/v1/tags')
    if (res.ok) {
      const json = await res.json()
      if (json && json.data && Array.isArray(json.data)) {
        tagOptions.value = json.data
      }
    }
  } catch (e) { /* 标签拉取失败不阻塞 */ }
}

onMounted(() => {
  fetchMenus()
  fetchTagOptions()
})

const openAddModal = () => {
  isEdit.value = false
  form.value = emptyForm()
  dialogVisible.value = true
}

const openEditModal = (menu) => {
  isEdit.value = true
  form.value = {
    id: menu.id,
    parentId: menu.parentId,
    name: menu.name,
    type: menu.type,
    target: { ...(menu.target || {}) },
    icon: menu.icon || '',
    sortOrder: menu.sortOrder || 0,
    enabled: !!menu.enabled
  }
  dialogVisible.value = true
}

const onTypeChange = () => {
  // 切换类型时重置 target，避免残留旧配置
  form.value.target = form.value.type === 'category' ? { tags: [] } : {}
}

const toggleEnabled = async (row, val) => {
  try {
    const res = await apiFetch(`/api/v1/admin/menus/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: val })
    })
    const json = await res.json()
    if (res.ok && json.code === 200) {
      row.enabled = val
      ElMessage.success(val ? '菜单已启用' : '菜单已停用')
    } else {
      ElMessage.error(json.message || '操作失败')
    }
  } catch (e) {
    ElMessage.error('操作失败: ' + e.message)
  }
}

const handleSubmit = async () => {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写菜单名称')
    return
  }
  saving.value = true
  try {
    const payload = {
      parentId: form.value.parentId || null,
      name: form.value.name.trim(),
      type: form.value.type,
      target: form.value.target,
      icon: form.value.icon || '',
      sortOrder: form.value.sortOrder || 0,
      enabled: !!form.value.enabled
    }
    const url = isEdit.value ? `/api/v1/admin/menus/${form.value.id}` : '/api/v1/admin/menus'
    const res = await apiFetch(url, {
      method: isEdit.value ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const json = await res.json()
    if (res.ok && json.data) {
      ElMessage.success(isEdit.value ? '菜单已更新' : '菜单已创建')
      dialogVisible.value = false
      await fetchMenus()
    } else {
      ElMessage.error(json.message || '保存失败')
    }
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (menu) => {
  try {
    await ElMessageBox.confirm(
      `确定删除菜单「${menu.name}」吗？其子菜单将自动提升为顶级。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    const res = await apiFetch(`/api/v1/admin/menus/${menu.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (res.ok && json.code === 200) {
      ElMessage.success('菜单已删除')
      await fetchMenus()
    } else {
      ElMessage.error(json.message || '删除失败')
    }
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}
</script>
