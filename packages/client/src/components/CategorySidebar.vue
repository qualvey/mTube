<template>
  <aside class="hidden lg:block w-52 shrink-0">
    <div class="sticky top-20 flex flex-col gap-1 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/70 rounded-2xl p-3 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div class="px-2 pb-2 text-[11px] font-black text-zinc-500 tracking-widest uppercase select-none">
        {{ t('sidebar.title') }}
      </div>
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
  </aside>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import CategoryMenuItem from './CategoryMenuItem.vue'

defineProps({
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

defineEmits(['select'])

const { t } = useI18n()
</script>
