<!-- 用户概述卡片：布局对齐 Art ActiveUser -->
<template>
  <div class="art-card h-105 p-4 box-border mb-5 max-sm:mb-4">
    <ArtBarChart
      class="box-border p-2"
      barWidth="50%"
      height="13.7rem"
      :showAxisLine="false"
      :data="chartData"
      :xAxisData="xAxisLabels"
    />
    <div class="ml-1">
      <h3 class="mt-5 text-lg font-medium">用户概述</h3>
      <p class="mt-1 text-sm">
        今日新增用户
        <span class="text-success font-medium">+{{ stats.todayUsers }}</span>
      </p>
      <p class="mt-1 text-sm">柱状图按用户规模生成展示，底部为真实 overview 指标</p>
    </div>
    <div class="flex-b mt-2">
      <div class="flex-1" v-for="(item, index) in list" :key="index">
        <p class="text-2xl text-g-900">{{ item.num }}</p>
        <p class="text-xs text-g-500">{{ item.name }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { WorkbenchStats } from '../types'

  const props = defineProps<{
    stats: WorkbenchStats
  }>()

  const xAxisLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月']

  const chartData = computed(() => {
    const base = Math.max(props.stats.totalUsers, 8)
    const factors = [0.55, 0.35, 0.52, 0.28, 0.66, 0.35, 0.6, 0.42, 0.55]
    return factors.map((f) => Math.max(8, Math.round(base * f)))
  })

  function fmt(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
    return String(n)
  }

  const list = computed(() => [
    { name: '总用户量', num: fmt(props.stats.totalUsers) },
    { name: '活跃用户', num: fmt(props.stats.activeUsers) },
    { name: '今日消息', num: fmt(props.stats.todayMessages) },
    { name: '好友关系', num: fmt(props.stats.totalFriendships) }
  ])
</script>
