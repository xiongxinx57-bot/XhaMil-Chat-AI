<template>
  <div class="art-card h-82 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>消息洞察</h4>
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

  const xAxisData = computed(() => {
    const trend = props.overview.messageTrend
    if (trend.length) return trend.map((item) => item.name)
    return ['1', '2', '3', '4', '5', '6', '7']
  })

  const chartData = computed<LineDataItem[]>(() => {
    const values = props.overview.messageTrend.map((item) => Number(item.value) || 0)
    const avg =
      values.length > 0
        ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
        : 0
    return [
      {
        name: '消息量',
        data: values.length ? values : [0, 0, 0, 0, 0, 0, 0]
      },
      {
        name: '日均基线',
        data: values.length ? values.map(() => avg) : [0, 0, 0, 0, 0, 0, 0]
      }
    ]
  })
</script>
