<!-- 工作台：Art console 布局 + overview / users 真实数据 -->
<template>
  <div v-loading="loading">
    <div v-if="overview.isConnected === false" class="art-card p-10 text-center">
      <ElEmpty description="数据库未连接">
        <p class="text-sm text-g-500 mb-4">请先完成 MySQL 连接配置，再查看工作台数据</p>
        <ElButton type="primary" @click="goDatabase">前往数据库配置</ElButton>
      </ElEmpty>
    </div>

    <template v-else>
      <CardList :stats="overview.stats" />

      <ElRow :gutter="20">
        <ElCol :sm="24" :md="12" :lg="10">
          <ActiveUser :stats="overview.stats" />
        </ElCol>
        <ElCol :sm="24" :md="12" :lg="14">
          <SalesOverview :trend="overview.messageTrend" />
        </ElCol>
      </ElRow>

      <ElRow :gutter="20">
        <ElCol :sm="24" :md="24" :lg="12">
          <NewUser :today-users="overview.stats.todayUsers" />
        </ElCol>
        <ElCol :sm="24" :md="12" :lg="6">
          <Dynamic :messages="overview.recentMessages" />
        </ElCol>
        <ElCol :sm="24" :md="12" :lg="6">
          <TodoList :stats="overview.stats" />
        </ElCol>
      </ElRow>
    </template>

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
  import { useRouter } from 'vue-router'
  import CardList from './modules/card-list.vue'
  import ActiveUser from './modules/active-user.vue'
  import SalesOverview from './modules/sales-overview.vue'
  import NewUser from './modules/new-user.vue'
  import Dynamic from './modules/dynamic-stats.vue'
  import TodoList from './modules/todo-list.vue'
  import { xhamilApi } from '@/api/xhamil'
  import type { WorkbenchOverview, WorkbenchStats } from './types'

  defineOptions({ name: 'XhamilWorkbench' })

  const router = useRouter()

  const emptyStats = (): WorkbenchStats => ({
    totalUsers: 0,
    todayUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    totalGroups: 0,
    totalDirectChats: 0,
    totalMessages: 0,
    todayMessages: 0,
    totalFriendships: 0,
    pendingFriendRequests: 0,
    aiBots: 0
  })

  const loading = ref(false)
  const error = ref('')
  const overview = ref<WorkbenchOverview>({
    isConnected: true,
    stats: emptyStats(),
    messageTrend: [],
    recentUsers: [],
    recentMessages: []
  })

  function pickStats(raw: any): WorkbenchStats {
    const s = raw?.stats || raw?.chat || raw || {}
    return {
      totalUsers: Number(s.totalUsers ?? s.users ?? 0) || 0,
      todayUsers: Number(s.todayUsers ?? 0) || 0,
      activeUsers: Number(s.activeUsers ?? 0) || 0,
      bannedUsers: Number(s.bannedUsers ?? 0) || 0,
      totalGroups: Number(s.totalGroups ?? s.groups ?? 0) || 0,
      totalDirectChats: Number(s.totalDirectChats ?? 0) || 0,
      totalMessages: Number(s.totalMessages ?? s.messages ?? 0) || 0,
      todayMessages: Number(s.todayMessages ?? 0) || 0,
      totalFriendships: Number(s.totalFriendships ?? s.friendships ?? 0) || 0,
      pendingFriendRequests: Number(s.pendingFriendRequests ?? 0) || 0,
      aiBots: Number(s.aiBots ?? 0) || 0
    }
  }

  function goDatabase() {
    router.push({ name: 'XhamilDatabase' })
  }

  async function load() {
    loading.value = true
    error.value = ''
    try {
      const raw = (await xhamilApi.getOverview()) || {}
      overview.value = {
        isConnected: raw.isConnected !== false,
        stats: pickStats(raw),
        messageTrend: Array.isArray(raw.messageTrend) ? raw.messageTrend : [],
        recentUsers: Array.isArray(raw.recentUsers) ? raw.recentUsers : [],
        recentMessages: Array.isArray(raw.recentMessages) ? raw.recentMessages : []
      }
    } catch (e: any) {
      error.value = e?.message || '加载失败'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)
</script>
