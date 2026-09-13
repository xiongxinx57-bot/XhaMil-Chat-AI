<template>
  <div class="art-card h-100 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>会话时长</h4>
      </div>
    </div>
    <ArtLineChart
      height="calc(100% - 30px)"
      :data="chartData"
      :xAxisData="xAxisData"
      :showLegend="true"
      :showAxisLabel="true"
      :showAxisLine="false"
      :showSplitLine="true"
    />
  </div>
</template>

<script setup lang="ts">
  import type { LineDataItem } from '@/types/component/chart'
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  const AREA_STYLE_CONFIG = {
    startOpacity: 0.08,
    endOpacity: 0
  } as const

  const xAxisData = computed(() => {
    const daily = props.overview.sessionDuration.daily
    if (daily.length) return daily.map((item) => item.name)
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  })

  const chartData = computed<LineDataItem[]>(() => {
    const daily = props.overview.sessionDuration.daily
    const thisWeek = daily.length
      ? daily.map((item) => Math.round((Number(item.avgSeconds) || 0) / 60))
      : [0, 0, 0, 0, 0, 0, 0]

    const change = Number(props.overview.sessionDuration.weekChangePercent) || 0
    const factor = 1 + change / 100
    const lastWeek = thisWeek.map((v) => {
      if (factor === 0) return 0
      return Math.max(0, Math.round(v / factor))
    })

    return [
      {
        name: '上周估算',
        data: lastWeek,
        areaStyle: AREA_STYLE_CONFIG
      },
      {
        name: '本周均时(分)',
        data: thisWeek,
        areaStyle: AREA_STYLE_CONFIG
      }
    ]
  })
</script>
