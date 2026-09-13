export type AnalysisStats = {
  totalUsers: number
  todayUsers: number
  activeUsers: number
  bannedUsers: number
  totalGroups: number
  totalDirectChats: number
  totalConversations: number
  totalMessages: number
  todayMessages: number
  totalFriendships: number
  pendingFriendRequests: number
  aiBots: number
}

export type AnalysisTrendPoint = { name: string; value: number }

export type AnalysisMessageType = {
  name: string
  type: string
  count: number
  value: number
  color: string
}

export type AnalysisClientInsight = {
  key: string
  name: string
  label: string
  count: number
  percent: number
  color: string
  icon: string
}

export type AnalysisHeatmap = {
  days: string[]
  hours: string[]
  cells: { day: string; hour: string; count: number; level: number }[]
  max: number
}

export type AnalysisSessionDuration = {
  avgSeconds: number
  avgLabel: string
  weekChangePercent: number
  daily: { name: string; value: number; avgSeconds: number; sessions: number }[]
}

export type AnalysisOverview = {
  stats: AnalysisStats
  messageTrend: AnalysisTrendPoint[]
  messageTypes: AnalysisMessageType[]
  clientInsights: AnalysisClientInsight[]
  weeklyHeatmap: AnalysisHeatmap
  sessionDuration: AnalysisSessionDuration
}

export function emptyAnalysisStats(): AnalysisStats {
  return {
    totalUsers: 0,
    todayUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    totalGroups: 0,
    totalDirectChats: 0,
    totalConversations: 0,
    totalMessages: 0,
    todayMessages: 0,
    totalFriendships: 0,
    pendingFriendRequests: 0,
    aiBots: 0
  }
}

export function emptyHeatmap(): AnalysisHeatmap {
  return {
    days: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    hours: ['0时', '4时', '8时', '12时', '15时', '19时', '22时'],
    cells: [],
    max: 0
  }
}

export function emptySessionDuration(): AnalysisSessionDuration {
  return {
    avgSeconds: 0,
    avgLabel: '0分00秒',
    weekChangePercent: 0,
    daily: []
  }
}
