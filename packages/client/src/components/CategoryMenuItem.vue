<template>
  <div class="flex flex-col gap-0.5">
    <!-- 菜单项本体 -->
    <button
      @click="onClick"
      class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left w-full"
      :class="[
        isActive ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold shadow' : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white',
        depth > 0 ? 'pl-6' : ''
      ]"
    >
      <span class="flex items-center gap-2 min-w-0">
        <MenuIcon v-if="item.icon" :name="item.icon" class="text-current opacity-80" />
        <span class="truncate">{{ item.name }}</span>
      </span>
      <svg
        v-if="item.children && item.children.length"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="w-3 h-3 shrink-0 opacity-50 transition-transform"
        :class="expanded ? 'rotate-90' : ''"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>

    <!-- 子菜单（递归） -->
    <div v-if="item.children && item.children.length && expanded" class="flex flex-col gap-0.5">
      <CategoryMenuItem
        v-for="child in item.children"
        :key="child.id"
        :item="child"
        :active-tag="activeTag"
        :depth="depth + 1"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import MenuIcon from './MenuIcon.vue'

const props = defineProps({
  /** 菜单节点（含 children） */
  item: {
    type: Object,
    required: true
  },
  /** 当前选中的分类标签（null = 全部） */
  activeTag: {
    type: String,
    default: null
  },
  /** 层级深度（用于缩进） */
  depth: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['select'])

/** 子菜单展开/收起（默认展开一级菜单，深层默认收起） */
// const expanded = ref(props.depth < 1)
const expanded = ref(False) // 默认全部收起，避免首次渲染时菜单过长

/** 选中态：category 类型且绑定的 tag 与当前选中一致（tags 空数组 = 全部） */
const isActive = computed(() => {
  if (props.item.type !== 'category') return false
  const tags = (props.item.target && props.item.target.tags) || []
  if (!tags.length) return !props.activeTag
  return tags.includes(props.activeTag)
})

const onClick = () => {
  if (props.item.children && props.item.children.length) {
    expanded.value = !expanded.value
    return
  }
  emit('select', props.item)
}
</script>
