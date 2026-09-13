<!-- 分析页：Art analysis 布局 + overview 真实数据 -->
<template>
  <div v-loading="loading">
    <ElRow :gutter="20">
      <ElCol :xl="14" :lg="15" :xs="24">
        <TodaySales :overview="overview" />
      </ElCol>
      <ElCol :xl="10" :lg="9" :xs="24">
        <VisitorInsights :overview="overview" />
      </ElCol>
    </ElRow>

    <ElRow :gutter="20">
      <ElCol :xl="10" :lg="10" :xs="24">
        <TotalRevenue :overview="overview" />
      </ElCol>
      <ElCol :xl="7" :lg="7" :xs="24">
        <CustomerSatisfaction :overview="overview" />
      </ElCol>
      <ElCol :xl="7" :lg="7" :xs="24">
        <TargetVsReality :overview="overview" />
      </ElCol>
    </ElRow>

    <ElRow :gutter="20">
      <ElCol :xl="10" :lg="10" :xs="24">
        <TopProducts :overview="overview" />
      </ElCol>
      <ElCol :xl="7" :lg="7" :xs="24">
        <SalesMappingByCountry :overview="overview" />
      </ElCol>
      <ElCol :xl="7" :lg="7" :xs="24">
        <VolumeServiceLevel :overview="overview" />
      </ElCol>
    </ElRow>

    <ElAlert
      v-if="error"
      class="mb-5"
      type="error"
      :title="error"
      show-icon
      :closable="false"
    />
  </div>
</template>

<script setup lang="ts">
  import TodaySales from './modules/today-sales.vue'
  import VisitorInsights from './modules/visitor-insights.vue'
  import TotalRevenue from './modules/total-revenue.vue'
  import CustomerSatisfaction from './modules/customer-satisfaction.vue'
  import TargetVsReality from './modules/target-vs-reality.vue'
  import TopProducts from './modules/top-products.vue'
  import SalesMappingByCountry from './modules/sales-mapping-by-country.vue'
  import VolumeServiceLevel from './modules/volume-service-level.vue'
  import { xhamilApi } from '@/api/xhamil'
  import {
    emptyAnalysisStats,
    emptyHeatmap,
    emptySessionDuration,
    type AnalysisOverview,
    type AnalysisStats
  } from './types'

  defineOptions({ name: 'XhamilAnalysis' })

  const loading = ref(false)
  const error = ref('')
  const overview = ref<AnalysisOverview>({
    stats: emptyAnalysisStats(),
    messageTrend: [],
    messageTypes: [],
    clientInsights: [],
    weeklyHeatmap: emptyHeatmap(),
    sessionDuration: emptySessionDuration()
  })

  function pickStats(raw: any): AnalysisStats {
    const s = raw?.stats || raw?.chat || raw || {}
    return {
      totalUsers: Number(s.totalUsers ?? s.users ?? 0) || 0,
      todayUsers: Number(s.todayUsers ?? 0) || 0,
      activeUsers: Number(s.activeUsers ?? 0) || 0,
      bannedUsers: Number(s.bannedUsers ?? 0) || 0,
      totalGroups: Number(s.totalGroups ?? s.groups ?? 0) || 0,
      totalDirectChats: Number(s.totalDirectChats ?? 0) || 0,
      totalConversations: Number(s.totalConversations ?? 0) || 0,
      totalMessages: Number(s.totalMessages ?? s.messages ?? 0) || 0,
      todayMessages: Number(s.todayMessages ?? 0) || 0,
      totalFriendships: Number(s.totalFriendships ?? s.friendships ?? 0) || 0,
      pendingFriendRequests: Number(s.pendingFriendRequests ?? 0) || 0,
      aiBots: Number(s.aiBots ?? 0) || 0
    }
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const raw = (await xhamilApi.getOverview()) || {}
      overview.value = {
        stats: pickStats(raw),
        messageTrend: Array.isArray(raw.messageTrend) ? raw.messageTrend : [],
        messageTypes: Array.isArray(raw.messageTypes) ? raw.messageTypes : [],
        clientInsights: Array.isArray(raw.clientInsights) ? raw.clientInsights : [],
        weeklyHeatmap:
          Array.isArray(raw.weeklyHeatmap?.cells) && raw.weeklyHeatmap.cells.length
            ? raw.weeklyHeatmap
            : emptyHeatmap(),
        sessionDuration:
          Array.isArray(raw.sessionDuration?.daily) && raw.sessionDuration.daily.length
            ? raw.sessionDuration
            : emptySessionDuration()
      }
    } catch (e: any) {
      error.value = e?.message || '分析页数据加载失败'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
</script>
