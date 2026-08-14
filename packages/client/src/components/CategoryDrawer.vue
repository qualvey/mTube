<template>
  <!-- 移动端分类抽屉：左侧滑出 + 遮罩，点击遮罩/选中后关闭 -->
  <Transition name="drawer">
    <div v-if="open" class="lg:hidden fixed inset-0 z-40">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="$emit('close')"></div>
      <!-- 抽屉面板 -->
      <div class="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 shadow-2xl flex flex-col">
        <div class="flex items-center justify-between px-4 py-4 border-b border-zinc-800/70">
          <span class="text-sm font-black text-zinc-300 tracking-widest uppercase select-none">
            {{ t('sidebar.title') }}
          </span>
          <button
            @click="$emit('close')"
            class="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all"
            :aria-label="t('feed.closeCategories')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
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
          <div v-if="!menus.length" class="px-3 py-2 text-xs text-zinc-600">—</div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import CategoryMenuItem from './CategoryMenuItem.vue'

defineProps({
  /** 抽屉显隐（仅移动端渲染） */
  open: {
    type: Boolean,
    default: false
  },
  /** 导航菜单树（管理侧配置 / 默认菜单） */
  menus: {
    type: Array,
    default: () => []
  },
  /** 当前选中的分类标签（null = 全部） */
  activeTag: {
    type: String,
    default: null
  }
})

defineEmits(['select', 'close'])

const { t } = useI18n()
</script>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s ease;
}
.drawer-enter-active .absolute.left-0,
.drawer-leave-active .absolute.left-0 {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .absolute.left-0,
.drawer-leave-to .absolute.left-0 {
  transform: translateX(-100%);
}
</style>
