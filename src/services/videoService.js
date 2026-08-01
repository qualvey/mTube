// Mock Backend Video Data & API Service

const mockVideos = [
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

// Device ID generator & persistence
export const getDeviceId = () => {
  let deviceId = localStorage.getItem('streamvip_device_id')
  if (!deviceId) {
    deviceId = 'dev-' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36)
    localStorage.setItem('streamvip_device_id', deviceId)
  }
  return deviceId
}

// Global Analytics Tracking Helper (PV, Video Clicks)
export const trackAnalytics = async (action = 'PV', videoId = null) => {
  try {
    const deviceId = getDeviceId()
    const payload = JSON.stringify({
      action,
      videoId,
      path: window.location.pathname || '/',
      deviceId,
      userAgent: navigator.userAgent,
      referer: document.referrer
    })

    // Try relative API path
    try {
      const res = await fetch('/api/v1/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      if (res.ok) return
    } catch (e) {}

    // Fallback to direct backend API server on port 3000
    await fetch('http://localhost:3000/api/v1/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    })
  } catch (e) {
    // Silent catch if backend server is offline
  }
}


export const videoService = {
  // Simulate fetching video list from backend API & trigger PV tracking
  async getVideos() {
    trackAnalytics('PV')
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(JSON.parse(JSON.stringify(mockVideos)))
      }, 400) // Simulated network latency
    })
  },

  // Track video click & play
  async trackVideoClick(videoId) {
    trackAnalytics('VIDEO_CLICK', videoId)
  },

  // Toggle video like state
  async toggleLike(videoId) {
    const video = mockVideos.find(v => v.id === videoId)
    if (video) {
      video.isLiked = !video.isLiked
      video.likes += video.isLiked ? 1 : -1
      return { success: true, isLiked: video.isLiked, likes: video.likes }
    }
    return { success: false }
  }
}

