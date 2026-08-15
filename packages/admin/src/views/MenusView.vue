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

          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <el-button size="small" text :disabled="!canMove(row, -1)" @click="moveMenu(row, -1)" title="上移">↑</el-button>
                <el-button size="small" text :disabled="!canMove(row, 1)" @click="moveMenu(row, 1)" title="下移">↓</el-button>
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
          
          <el-form-item label="英文名称 (English)">
            <el-input v-model="form.nameEn" placeholder="Video / VIP Zone" />
            <span class="text-[11px] text-slate-500 mt-1">留空 = C 端英文环境显示中文名</span>
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
                      <el-select v-model="form.icon" placeholder="选择图标" clearable filterable style="width: 100%">
              <el-option v-for="opt in ICON_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value">
                <span class="inline-flex items-center gap-2">
                  <span class="w-4 h-4 inline-block text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="opt.path" /></svg>
                  </span>
                  <span>{{ opt.label }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>


          <el-form-item label="排序 (数字越小越靠前)">
            <el-input-number v-model="form.sortOrder" :min="0" :max="999" style="width: 100%" />
          </el-form-item>
        </div>

        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
          <span class="text-[11px] text-slate-500 ml-2">停用后 C 端不再展示该菜单</span>
        

        </el-form-item>
<el-form-item label="可见性 (Visibility)">
          <el-select v-model="form.visibility" style="width: 100%">
            <el-option label="全部可见 (all)" value="all" />
            <el-option label="仅未登录 (guest)" value="guest" />
            <el-option label="仅登录用户 (logged_in)" value="logged_in" />
            <el-option label="仅 VIP (vip)" value="vip" />
          </el-select>
          <span class="text-[11px] text-slate-500 mt-1">按登录 / VIP 状态控制 C 端显示（子菜单跟随父级）</span>
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

// 与 C 端 MenuIcon.vue 图标库一致（Heroicons 24 outline；path 仅用于 admin 预览）
const ICON_OPTIONS = [
  { value: 'home', label: '首页 home', path: 'M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75' },
  { value: 'fire', label: '热门 fire', path: 'M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48zM12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z' },
  { value: 'play', label: '播放 play', path: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z' },
  { value: 'video-camera', label: '视频 video-camera', path: 'M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z' },
  { value: 'star', label: '收藏 star', path: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z' },
  { value: 'crown', label: 'VIP crown', path: 'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0' },
  { value: 'user', label: '用户 user', path: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z' },
  { value: 'cog', label: '设置 cog', path: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z' },
  { value: 'grid', label: '分类 grid', path: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
  { value: 'film', label: '影视 film', path: 'M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625c0-.621.504-1.125 1.125-1.125m0 16.5c.621 0 1.125-.504 1.125-1.125m0-14.25A1.125 1.125 0 016 4.5h12a1.125 1.125 0 011.125 1.125m0 0a1.125 1.125 0 011.125 1.125v11.625c0 .621-.504 1.125-1.125 1.125m-14.25-13.5h13.5v2.25m-13.5-2.25v11.25m13.5-11.25H6.375m13.5 11.25H8.625m4.5-8.25h3.75M6.375 12h3.75m-3.75 3h3.75' },
  { value: 'musical-note', label: '音乐 musical-note', path: 'M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z' },
  { value: 'heart', label: '喜欢 heart', path: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z' },
  { value: 'clock', label: '历史 clock', path: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' },
  { value: 'search', label: '搜索 search', path: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z' },
  { value: 'tag', label: '标签 tag', path: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z' },
  { value: 'gift', label: '礼包 gift', path: 'M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z' },
  { value: 'chart-bar', label: '排行 chart-bar', path: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
  { value: 'bolt', label: '快闪 bolt', path: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' },
  { value: 'menu', label: '菜单 menu', path: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5' }
]

const emptyForm = () => ({
  id: '',
  parentId: null,
  name: '',
  nameEn: '',
  type: 'category',
  target: { tags: [] },
  icon: '',
  sortOrder: 0,
  enabled: true,
  visibility: 'all'
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
    enabled: !!menu.enabled,
    nameEn: menu.nameEn || '',
    visibility: menu.visibility || 'all'
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

/** 同级排序：是否可上/下移 */
const canMove = (row, dir) => {
  const siblings = menus.value
    .filter(m => (m.parentId || null) === (row.parentId || null))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const idx = siblings.findIndex(x => x.id === row.id)
  return dir === -1 ? idx > 0 : idx < siblings.length - 1
}

/** 同级上移/下移（交换 sortOrder） */
const moveMenu = async (row, dir) => {
  const siblings = menus.value
    .filter(m => (m.parentId || null) === (row.parentId || null))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const idx = siblings.findIndex(x => x.id === row.id)
  const target = siblings[idx + dir]
  if (!target) return
  try {
    await Promise.all([
      apiFetch(`/api/v1/admin/menus/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: target.sortOrder })
      }),
      apiFetch(`/api/v1/admin/menus/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: row.sortOrder })
      })
    ])
    fetchMenus()
  } catch (e) {
    ElMessage.error('排序失败: ' + e.message)
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
      enabled: !!form.value.enabled,
      nameEn: form.value.nameEn || '',
      visibility: form.value.visibility || 'all'
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
