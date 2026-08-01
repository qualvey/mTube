// Video API & Service layer for Client (Connects to /api/v1/videos with mock fallback)

const mockFallbackVideos = [
  {
    id: 'vid-101',
    title: '【4K Ultra HD】赛博朋克极光之夜 - 4K 独家帧率体验',
    description: '穿梭于未来的高科技都市，探索极光与霓虹交织的夜空，感受极致震撼的视觉与听觉盛宴。',
    author: 'CyberVision Studio',
    authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=150&auto=format&fit=crop',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    poster: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
    duration: '09:56',
    likes: 24890,
    comments: 1320,
    shares: 854,
    isVip: false,
    isLiked: false,
    tags: ['4K画质', '赛博朋克', '视觉盛宴']
  },
  {
    id: 'vid-102',
    title: '【VIP尊享】无人区探秘：绝美自然风光与未解之谜',
    description: '深度探索隐藏在冰川与荒野深处的禁忌之地，独家未删减版 60 FPS 臻彩全景展现。',
    author: '探索者影业',
    authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=150&auto=format&fit=crop',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    poster: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=800&auto=format&fit=crop',
    duration: '10:53',
    likes: 89400,
    comments: 4201,
    shares: 2190,
    isVip: true,
    isLiked: false,
    tags: ['VIP专享', '4K原片', '纪录片']
  },
  {
    id: 'vid-103',
    title: '【超清体验】未来都市速度与激情 - 极速飘移',
    description: '重光交错的地下赛车场，音浪与轮胎摩擦的极致张力，全角度镜头捕捉每一个刺激瞬间。',
    author: 'SpeedDemon FX',
    authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=150&auto=format&fit=crop',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    poster: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=800&auto=format&fit=crop',
    duration: '00:15',
    likes: 15300,
    comments: 642,
    shares: 310,
    isVip: false,
    isLiked: false,
    tags: ['极速', '引擎轰鸣', '热血']
  },
  {
    id: 'vid-104',
    title: '【VIP专属】黑科技光影特效解析与幕后镜头',
    description: '独家幕后高精度镜头，揭秘好莱坞顶级特效团队制作过程，解锁全部未公开片段。',
    author: 'CinemaLab VIP',
    authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=150&auto=format&fit=crop',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    poster: 'https://images.unsplash.com/photo-1518173946687-a4c8a383392e?q=80&w=800&auto=format&fit=crop',
    duration: '12:14',
    likes: 104200,
    comments: 8900,
    shares: 4500,
    isVip: true,
    isLiked: false,
    tags: ['VIP独家', '幕后花絮', '特效解析']
  }
]

// Global Analytics Tracking Helper (PV, Video Clicks)
export const trackAnalytics = async (action = 'PV', videoId = null) => {
  try {
    let deviceId = localStorage.getItem('mp_device_id')
    if (!deviceId) {
      deviceId = 'dev-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36)
      localStorage.setItem('mp_device_id', deviceId)
    }
    await fetch('/api/v1/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        videoId,
        path: window.location.pathname || '/',
        deviceId,
        userAgent: navigator.userAgent,
        referer: document.referrer
      })
    })
  } catch (e) {
    // Silent catch
  }
}

export const videoService = {

  // Fetch video list from backend REST API or fallback to mock data
  async getVideos(filter = null, tag = null) {
    try {
      const params = new URLSearchParams()
      if (filter) params.append('filter', filter)
      if (tag) params.append('tag', tag)

      const url = `/api/v1/videos${params.toString() ? '?' + params.toString() : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        if (json && json.data) {
          return json.data
        }
      }
    } catch (e) {
      console.warn('Backend API connection failed, using local dataset fallback:', e)
    }
    return JSON.parse(JSON.stringify(mockFallbackVideos))
  },

  // Fetch all tags with video counts
  async getTags() {
    try {
      const res = await fetch('/api/v1/tags')
      if (res.ok) {
        const json = await res.json()
        if (json && json.data) {
          return json.data
        }
      }
    } catch (e) {
      console.warn('Tag fetch failed:', e)
    }
    return []
  },

  // Toggle video like
  async toggleLike(videoId) {
    try {
      const res = await fetch(`/api/v1/videos/${videoId}/like`, { method: 'POST' })
      if (res.ok) {
        const json = await res.json()
        return json.data
      }
    } catch (e) {
      console.warn('API error, falling back:', e)
    }
    return { success: true }
  },

  // Get dynamic paywall config from backend
  async getPaywallConfig() {
    try {
      const res = await fetch('/api/v1/paywall/config')
      if (res.ok) {
        const json = await res.json()
        return json.data
      }
    } catch (e) {
      console.warn('Paywall config fetch failed:', e)
    }
    return null
  }
}
