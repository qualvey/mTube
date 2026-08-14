<template>
  <aside class="hidden lg:block w-52 shrink-0">
    <div class="sticky top-20 flex flex-col gap-1 bg-zinc-950/70 backdrop-blur-md border border-zinc-800/70 rounded-2xl p-3 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div class="px-2 pb-2 text-[11px] font-black text-zinc-500 tracking-widest uppercase select-none">
        {{ t('sidebar.title') }}
      </div>
      <button
        v-for="item in items"
        :key="item.key"
        @click="select(item.tag)"
        class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left w-full"
        :class="isActive(item) ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold shadow' : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white'"
      >
        <span class="truncate">{{ item.label }}</span>
        <span v-if="item.count !== undefined" class="text-[10px] font-mono opacity-70 shrink-0">{{ item.count }}</span>
      </button>
      <div v-if="!tags.length" class="px-3 py-2 text-xs text-zinc-600">—</div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  /** 标签列表 [{ name, count }] */
  tags: {
    type: Array,
    default: () => []
  },
  /** 当前选中的分类标签（null = 全部） */
  activeTag: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select'])

const { t } = useI18n()

const items = computed(() => [
  { key: 'all', label: t('feed.allCategories'), tag: null },
  ...props.tags.map(tag => ({
    key: `tag-${tag.name}`,
    label: tag.name,
    tag: tag.name,
    count: tag.count
  }))
])

const isActive = (item) => {
  if (item.tag === null) return !props.activeTag
  return props.activeTag === item.tag
}

const select = (tag) => {
  // 点击当前选中项 = 取消（回到全部）
  const target = tag === props.activeTag ? null : tag
  emit('select', target)
}
</script>
