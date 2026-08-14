import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '../layouts/AdminLayout.vue'
import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import AnalyticsView from '../views/AnalyticsView.vue'
import VideosView from '../views/VideosView.vue'
import StorageNodesView from '../views/StorageNodesView.vue'
import OrdersView from '../views/OrdersView.vue'
import SettingsView from '../views/SettingsView.vue'
import AdsView from '../views/AdsView.vue'
import MenusView from '../views/MenusView.vue'
import SiteI18nView from '../views/SiteI18nView.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: DashboardView,
        meta: { title: '控制台概览', icon: 'DataAnalysis' }
      },
      {
        path: 'analytics',
        name: 'Analytics',
        component: AnalyticsView,
        meta: { title: '数据分析', icon: 'TrendCharts' }
      },
      {
        path: 'videos',
        name: 'Videos',
        component: VideosView,
        meta: { title: '视频资源管理', icon: 'VideoCamera' }
      },
      {
        path: 'storage-nodes',
        name: 'StorageNodes',
        component: StorageNodesView,
        meta: { title: '存储节点管理', icon: 'Server' }
      },
      {
        path: 'orders',
        name: 'Orders',
        component: OrdersView,
        meta: { title: '营收与订单明细', icon: 'ShoppingCart' }
      },
      {
        path: 'ads',
        name: 'Ads',
        component: AdsView,
        meta: { title: '广告管理', icon: 'Promotion' }
      },
      {
        path: 'menus',
        name: 'Menus',
        component: MenusView,
        meta: { title: '菜单管理', icon: 'Menu' }
      },
      {
        path: 'site-i18n',
        name: 'SiteI18n',
        component: SiteI18nView,
        meta: { title: '文案定制', icon: 'EditPen' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: SettingsView,
        meta: { title: '系统设置', icon: 'Setting' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  if (to.meta.requiresAuth !== false && !isLoggedIn) {
    next({ name: 'Login' })
  } else if (to.name === 'Login' && isLoggedIn) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

export default router
