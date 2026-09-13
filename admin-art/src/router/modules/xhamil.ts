import { AppRouteRecord } from '@/types/router'

/** XhaMil 业务菜单（对接 Node /api/admin，对齐现网 React 后台能力） */
export const xhamilRoutes: AppRouteRecord[] = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    component: '/index/index',
    meta: {
      title: '仪表盘',
      icon: 'ri:pie-chart-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'console',
        name: 'Console',
        component: '/xhamil/workbench/index',
        meta: {
          title: '工作台',
          icon: 'ri:home-smile-2-line',
          keepAlive: false,
          fixedTab: true
        }
      },
      {
        path: 'analysis',
        name: 'Analysis',
        component: '/xhamil/analysis/index',
        meta: {
          title: '分析页',
          icon: 'ri:line-chart-line',
          keepAlive: false
        }
      }
    ]
  },
  {
    name: 'XhamilUsersGroup',
    path: '/biz',
    component: '/index/index',
    meta: {
      title: '用户与群组',
      icon: 'ri:group-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'users',
        name: 'XhamilUsers',
        component: '/xhamil/users/index',
        meta: { title: '用户管理', icon: 'ri:user-line', keepAlive: false }
      },
      {
        path: 'groups',
        name: 'XhamilGroups',
        component: '/xhamil/groups/index',
        meta: { title: '群聊管理', icon: 'ri:chat-3-line', keepAlive: false }
      },
      {
        path: 'group-ai',
        name: 'XhamilGroupAi',
        component: '/xhamil/group-ai/index',
        meta: { title: '群 AI 配置', icon: 'ri:robot-2-line', keepAlive: false }
      },
      {
        path: 'public-voice-rooms',
        name: 'XhamilPublicVoiceRooms',
        component: '/xhamil/public-voice-rooms/index',
        meta: { title: '公共语音房', icon: 'ri:mic-line', keepAlive: false }
      }
    ]
  },
  {
    name: 'XhamilMediaGroup',
    path: '/media',
    component: '/index/index',
    meta: {
      title: '图片与视频',
      icon: 'ri:image-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'chat-photos',
        name: 'XhamilChatPhotos',
        component: '/xhamil/chat-photos/index',
        meta: { title: '聊天图片', icon: 'ri:image-2-line', keepAlive: false }
      },
      {
        path: 'chat-videos',
        name: 'XhamilChatVideos',
        component: '/xhamil/chat-videos/index',
        meta: { title: '聊天视频', icon: 'ri:film-line', keepAlive: false }
      },
      {
        path: 'moments-photos',
        name: 'XhamilMomentsPhotos',
        component: '/xhamil/moments-photos/index',
        meta: { title: '说说图片', icon: 'ri:gallery-line', keepAlive: false }
      },
      {
        path: 'avatars',
        name: 'XhamilAvatars',
        component: '/xhamil/avatars/index',
        meta: { title: '头像', icon: 'ri:user-smile-line', keepAlive: false }
      },
      {
        path: 'group-announcement-images',
        name: 'XhamilGroupAnnouncementImages',
        component: '/xhamil/group-announcement-images/index',
        meta: { title: '群公告图片', icon: 'ri:megaphone-line', keepAlive: false }
      },
      {
        path: 'icons',
        name: 'XhamilIcons',
        component: '/xhamil/icons/index',
        meta: { title: '官方图标', icon: 'ri:apps-2-line', keepAlive: false }
      }
    ]
  },
  {
    name: 'XhamilContentGroup',
    path: '/content',
    component: '/index/index',
    meta: {
      title: '内容管理',
      icon: 'ri:file-list-3-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'moments',
        name: 'XhamilMoments',
        component: '/xhamil/moments/index',
        meta: { title: '说说管理', icon: 'ri:chat-quote-line', keepAlive: false }
      },
      {
        path: 'reports',
        name: 'XhamilReports',
        component: '/xhamil/reports/index',
        meta: { title: '举报中心', icon: 'ri:alarm-warning-line', keepAlive: false }
      },
      {
        path: 'chat-voice',
        name: 'XhamilChatVoice',
        component: '/xhamil/chat-voice/index',
        meta: { title: '聊天语音', icon: 'ri:mic-line', keepAlive: false }
      },
      {
        path: 'group-files',
        name: 'XhamilGroupFiles',
        component: '/xhamil/group-files/index',
        meta: { title: '文件管理', icon: 'ri:folder-3-line', keepAlive: false }
      }
    ]
  },
  {
    name: 'XhamilConfigGroup',
    path: '/cfg',
    component: '/index/index',
    meta: {
      title: '系统配置',
      icon: 'ri:settings-3-line',
      roles: ['R_SUPER', 'R_ADMIN']
    },
    children: [
      {
        path: 'database',
        name: 'XhamilDatabase',
        component: '/xhamil/database/index',
        meta: { title: '数据库', icon: 'ri:database-2-line', keepAlive: false }
      },
      {
        path: 'verification',
        name: 'XhamilVerification',
        component: '/xhamil/verification/index',
        meta: { title: '注册验证', icon: 'ri:shield-keyhole-line', keepAlive: false }
      },
      {
        path: 'functional-dev',
        name: 'XhamilFunctionalDev',
        component: '/xhamil/functional-dev/index',
        meta: { title: '功能性开发配置', icon: 'ri:tools-line', keepAlive: false }
      },
      {
        path: 'banned-words',
        name: 'XhamilBannedWords',
        component: '/xhamil/banned-words/index',
        meta: { title: '违禁词', icon: 'ri:prohibited-line', keepAlive: false }
      },
      {
        path: 'app-update',
        name: 'XhamilAppUpdate',
        component: '/xhamil/app-update/index',
        meta: { title: 'App 发版', icon: 'ri:download-cloud-2-line', keepAlive: false }
      },
      {
        path: 'download-page',
        name: 'XhamilDownloadPage',
        component: '/xhamil/download-page/index',
        meta: { title: '下载页面', icon: 'ri:smartphone-line', keepAlive: false }
      },
      {
        path: 'changelog',
        name: 'XhamilChangelog',
        component: '/xhamil/changelog/index',
        meta: { title: '更新日志', icon: 'ri:file-list-3-line', keepAlive: false }
      },
      {
        path: 'draw-guess',
        name: 'XhamilDrawGuess',
        component: '/xhamil/draw-guess/index',
        meta: { title: '你画我猜', icon: 'ri:palette-line', keepAlive: false }
      },
      {
        path: 'database-browse',
        name: 'XhamilDatabaseBrowse',
        component: '/xhamil/database-browse/index',
        meta: { title: '表数据预览', icon: 'ri:table-line', keepAlive: false }
      },
      {
        path: 'app-docs',
        name: 'XhamilAppDocs',
        component: '/xhamil/app-docs/index',
        meta: {
          title: 'App 使用文档',
          icon: 'ri:book-2-line',
          keepAlive: false,
          isHide: true
        }
      }
    ]
  }
]
