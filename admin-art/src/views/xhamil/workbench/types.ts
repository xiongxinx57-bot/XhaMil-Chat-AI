export type WorkbenchStats = {
  totalUsers: number
  todayUsers: number
  activeUsers: number
  bannedUsers: number
  totalGroups: number
  totalDirectChats: number
  totalMessages: number
  todayMessages: number
  totalFriendships: number
  pendingFriendRequests: number
  aiBots: number
}

export type WorkbenchTrendPoint = { name: string; value: number }

export type WorkbenchRecentUser = {
  id: number
  chatNo?: number | string
  username?: string
  nickname?: string
  avatarUrl?: string
  status?: string
  isBanned?: boolean
  createdAt?: string
}

export type WorkbenchRecentMessage = {
  id: number
  content?: string
  messageTypeLabel?: string
  createdAt?: string
  userName?: string
  conversationTitle?: string
  convType?: string
}

export type WorkbenchOverview = {
  isConnected?: boolean
  stats: WorkbenchStats
  messageTrend: WorkbenchTrendPoint[]
  recentUsers: WorkbenchRecentUser[]
  recentMessages: WorkbenchRecentMessage[]
}
