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
