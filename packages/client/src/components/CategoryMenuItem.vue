<template>
  <div class="flex flex-col">
    <!-- 菜单项 -->
    <button
      @click="onClick"
      class="group relative flex items-center gap-2.5 w-full rounded-xl transition-all duration-200 text-left"
      :class="[
        isActive
          ? 'bg-(--bg-card)/80 border border-(--border-subtle) shadow-sm text-(--text-primary)'
          : 'border border-transparent text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-input)',
        depth > 0 ? 'pl-10 pr-2.5 py-1.5' : 'px-2 py-1.5'
      ]"
    >
      <!-- 选中指示条 -->
      <span
        v-if="isActive"
        class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-yellow-400 to-amber-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
      />

      <!-- 一级：图标容器（有承托，选中变金色） -->
      <span
        v-if="depth === 0"
        class="flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0"
        :class="isActive
          ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-black shadow-md group-hover:shadow-lg'
          : 'bg-(--bg-input) text-(--text-faint) group-hover:bg-(--bg-hover) group-hover:text-(--text-secondary)'"
      >
        <MenuIcon v-if="item.icon" :name="item.icon" class="w-[18px] h-[18px]" />
      </span>

      <!-- 二级及以上：小圆点引导（对齐竖线） -->
      <span
        v-else
        class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
        :class="isActive ? 'bg-yellow-400' : 'bg-(--text-faint) group-hover:bg-(--text-muted)'"
      />

      <!-- 文字 -->
      <span class="min-w-0 flex-1">
        <span
          class="block truncate text-[13px] leading-5"
          :class="[isActive ? 'font-bold text-(--text-primary)' : 'font-medium', depth > 0 ? 'text-xs' : '']"
        >
          {{ item.name }}
        </span>
        <span v-if="depth === 0 && item.children && item.children.length" class="block text-[10px] text-(--text-faint) leading-4">
          {{ item.children.length }} 项
        </span>
      </span>

      <!-- 展开箭头 -->
      <svg
        v-if="item.children && item.children.length"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
        :class="[expanded ? 'rotate-90' : '', isActive ? 'text-yellow-400' : 'text-(--text-faint) group-hover:text-(--text-muted)']"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </button>

    <!-- 子菜单（左侧竖线引导） -->
    <div
      v-if="item.children && item.children.length && expanded"
      class="relative ml-[30px] pl-3.5 mt-0.5 border-l border-(--border-subtle) flex flex-col gap-0.5"
    >
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
  /** 菜单项（含 children） */
  item: {
    type: Object,
    required: true
  },
  /** 当前选中 tag（null = 全部） */
  activeTag: {
    type: String,
    default: null
  },
  /** 层级深度（0 = 一级） */
  depth: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['select'])

/** 子菜单默认收起，避免首次渲染菜单过长 */
const expanded = ref(false)

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
