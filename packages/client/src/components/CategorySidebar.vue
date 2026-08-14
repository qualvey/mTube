<template>
  <!--
    PC 侧边栏：最高层级浮层（独立于 header）
    - 展开态: fixed 全高 z-50 + 半透明遮罩 z-40，悬浮于内容之上，不挤压任何布局空间
    - 收纳态: 窄条按钮 fixed 于 header 下方（top-24），与 header 平级互不影响
  -->
  <Teleport to="body">
    <!-- 遮罩（仅展开时） -->
    <Transition name="fade">
      <div
        v-if="!collapsed"
        class="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        @click="$emit('toggle')"
      />
    </Transition>

    <!-- 展开面板 -->
    <Transition name="slide-in">
      <aside
        v-if="!collapsed"
        class="hidden lg:flex fixed left-0 top-0 bottom-0 z-50 w-72 flex-col bg-(--bg-page)/95 backdrop-blur-md border-r border-(--border-subtle)/80 shadow-2xl"
      >
        <div class="flex items-center justify-between px-4 py-3.5 border-b border-(--border-subtle)/60 shrink-0">
          <span class="text-[11px] font-black text-(--text-faint) tracking-widest uppercase select-none">
            {{ t('sidebar.title') }}
          </span>
          <button
            @click="$emit('toggle')"
            class="w-7 h-7 rounded-lg bg-(--bg-input) hover:bg-(--bg-input) border border-white/10 text-(--text-secondary) flex items-center justify-center transition-all active:scale-95"
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
          <div v-if="!menus.length" class="px-3 py-2 text-xs text-(--text-faint)">-</div>
        </div>

        <!-- 明暗模式切换（最下方） -->
        <div class="shrink-0 px-3 py-2.5 border-t border-(--border-subtle) flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <!-- 简约纯形状图标：深色=月亮 / 浅色=太阳 -->
            <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4.5 h-4.5 text-(--text-muted)">
              <path d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="w-4.5 h-4.5 text-(--text-muted)">
              <path d="M12 2.25v2.25m0 13.5V20.25m9-9h-2.25M5.25 11.25H3m15.045-6.045l-1.591 1.591M7.455 15.045l-1.591 1.591m12.681 0l-1.591-1.591M7.455 8.955L5.864 7.364M12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
            </svg>
            <span class="text-xs text-(--text-muted) font-medium select-none">{{ t('sidebar.darkMode') }}</span>
          </div>

          <!-- 切换开关 -->
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
      </aside>
    </Transition>

    <!-- 收纳态窄条（header 下方，与 header 平级） -->
    <button
      v-if="collapsed"
      @click="$emit('toggle')"
      class="hidden lg:flex fixed left-0 top-24 bottom-0 z-20 w-11 flex-col items-center pt-4 gap-3 text-(--text-faint) hover:text-(--text-secondary) bg-(--bg-page)/70 border-r border-(--border-subtle)/60 transition-colors"
      :title="t('sidebar.expand')"
      :aria-label="t('sidebar.expand')"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  </Teleport>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import CategoryMenuItem from './CategoryMenuItem.vue'
import { useTheme } from '../services/themeService'

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
const { isDark, toggleTheme } = useTheme()
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-in-enter-active,
.slide-in-leave-active {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-in-enter-from,
.slide-in-leave-to {
  transform: translateX(-100%);
}
</style>
