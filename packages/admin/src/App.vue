<template>
  <UpdateBanner />
  <router-view />
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import UpdateBanner from './components/UpdateBanner.vue'
import { startVersionCheck, stopVersionCheck } from './services/versionService'

onMounted(() => {
  startVersionCheck()
})

onUnmounted(() => {
  stopVersionCheck()
})
</script>
