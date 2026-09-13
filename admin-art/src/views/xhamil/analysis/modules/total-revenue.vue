<template>
  <div class="art-card h-100 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>会话活跃</h4>
      </div>
    </div>
    <ArtBarChart
      height="calc(100% - 30px)"
      :data="revenueData"
      :xAxisData="weekDays"
      :showLegend="true"
      :showAxisLine="false"
      barWidth="18%"
    />
  </div>
</template>

<script setup lang="ts">
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  const weekDays = computed(() => {
    const daily = props.overview.sessionDuration.daily
    if (daily.length) return daily.map((item) => item.name)
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  })

  const revenueData = computed(() => {
    const daily = props.overview.sessionDuration.daily
    const sessions = daily.length
      ? daily.map((item) => Number(item.sessions) || 0)
      : [0, 0, 0, 0, 0, 0, 0]
    const duration = daily.length
      ? daily.map((item) => Math.round((Number(item.avgSeconds) || 0) / 60))
      : [0, 0, 0, 0, 0, 0, 0]

    return [
      { name: '会话数', data: sessions },
      { name: '均时(分)', data: duration }
    ]
  })
</script>
