import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import VideoDetailView from '../views/VideoDetailView.vue'

// createWebHistory(import.meta.env.BASE_URL)：兼容子路径反代部署（base 由 vite 配置）
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/video/:id',
      name: 'video-detail',
      component: VideoDetailView,
      props: true
    },
    // 未知路径回首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
