<template>
  <!-- 移动端分类抽屉：左侧滑出 + 遮罩，点击遮罩/选中后关闭 -->
  <Transition name="drawer">
    <div v-if="open" class="lg:hidden fixed inset-0 z-40">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="$emit('close')"></div>
      <!-- 抽屉面板 -->
      <div class="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-(--bg-page) border-r border-(--border-subtle) shadow-2xl flex flex-col">
        <div class="flex items-center justify-between px-4 py-4 border-b border-(--border-subtle)/70">
          <span class="text-sm font-black text-(--text-secondary) tracking-widest uppercase select-none">
            {{ t('sidebar.title') }}
          </span>
          <button
            @click="$emit('close')"
            class="w-8 h-8 rounded-lg bg-(--bg-hover)/80 hover:bg-zinc-700 flex items-center justify-center text-(--text-muted) hover:text-(--text-primary) transition-all"
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
          <div v-if="!menus.length" class="px-3 py-2 text-xs text-(--text-faint)">—</div>
        </div>

        <!-- 明暗模式切换（最下方，与 PC 侧边栏一致） -->
        <div class="shrink-0 px-3 py-2.5 border-t border-(--border-subtle) flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4.5 h-4.5 text-(--text-muted)">
              <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4.5 h-4.5 text-(--text-muted)">
              <path d="M12 2.25v2.25m0 13.5V20.25m9-9h-2.25M5.25 11.25H3m15.045-6.045l-1.591 1.591M7.455 15.045l-1.591 1.591m12.681 0l-1.591-1.591M7.455 8.955L5.864 7.364M12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
            </svg>
            <span class="text-xs text-(--text-muted) font-medium select-none">{{ t('sidebar.darkMode') }}</span>
          </div>
          <button
            @click="toggleTheme"
            role="switch"
            :aria-checked="isDark"
            class="relative w-10 h-5.5 shrink-0 rounded-full transition-colors duration-300"
            :class="isDark ? 'bg-yellow-500/80' : 'bg-zinc-300'"
            :aria-label="t('sidebar.darkMode')"
          >
            <span
              class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-transform duration-300"
              :class="isDark ? 'translate-x-4.5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import CategoryMenuItem from './CategoryMenuItem.vue'
import { useTheme } from '../services/themeService'

const { isDark, toggleTheme } = useTheme()

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
