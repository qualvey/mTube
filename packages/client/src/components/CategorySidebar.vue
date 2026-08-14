<template>
  <!-- PC 固定侧边栏：fixed 定位不随滚动，可收纳 -->
  <aside
    v-if="!collapsed"
    class="hidden lg:flex fixed left-0 top-24 bottom-0 z-20 w-60 flex-col bg-zinc-950/85 backdrop-blur-md border-r border-zinc-800/70"
  >
    <div class="flex items-center justify-between px-3 py-3 border-b border-zinc-800/60 shrink-0">
      <span class="text-[11px] font-black text-zinc-500 tracking-widest uppercase select-none">
        {{ t('sidebar.title') }}
      </span>
      <button
        @click="$emit('toggle')"
        class="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-zinc-300 flex items-center justify-center transition-all active:scale-95"
        :title="t('sidebar.collapse')"
        :aria-label="t('sidebar.collapse')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
      <CategoryMenuItem
        v-for="item in menus"
        :key="item.id"
        :item="item"
        :active-tag="activeTag"
        :depth="0"
        @select="$emit('select', $event)"
      />
      <div v-if="!menus.length" class="px-3 py-2 text-xs text-zinc-600">-</div>
    </div>
  </aside>

  <!-- 收纳态：左侧窄条按钮，点击展开 -->
  <button
    v-else
    @click="$emit('toggle')"
    class="hidden lg:flex fixed left-0 top-24 bottom-0 z-20 w-11 flex-col items-center pt-4 gap-3 text-zinc-500 hover:text-zinc-300 bg-zinc-950/70 border-r border-zinc-800/60 transition-colors"
    :title="t('sidebar.expand')"
    :aria-label="t('sidebar.expand')"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  </button>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import CategoryMenuItem from './CategoryMenuItem.vue'

defineProps({
  /** 菜单树（分类 / 链接） */
  menus: {
    type: Array,
    default: () => []
  },
  /** 当前选中 tag（null = 全部） */
  activeTag: {
    type: String,
    default: null
  },
  /** 是否收纳（仅保留窄条按钮） */
  collapsed: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select', 'toggle'])

const { t } = useI18n()
</script>
