<template>
  <div class="art-card h-82 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>时段活跃</h4>
      </div>
    </div>

    <ArtBarChart
      class="mt-6"
      height="14.3rem"
      :data="volumeServiceData"
      :xAxisData="serviceCategories"
      :showLegend="true"
      :showAxisLine="false"
      :stack="true"
      barWidth="22%"
    />
  </div>
</template>

<script setup lang="ts">
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  const serviceCategories = computed(() => {
    const hours = props.overview.weeklyHeatmap.hours
    return hours.length ? hours : ['0时', '4时', '8时', '12时', '15时', '19时', '22时']
  })

  const volumeServiceData = computed(() => {
    const { hours, days, cells } = props.overview.weeklyHeatmap
    const hourLabels = hours.length
      ? hours
      : ['0时', '4时', '8时', '12时', '15时', '19时', '22时']
    const dayLabels = days.length
      ? days
      : ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

    // 工作日 vs 周末 堆叠，按小时槽汇总
    const weekdaySet = new Set(['周一', '周二', '周三', '周四', '周五'])
    const workday = hourLabels.map((hour) =>
      cells
        .filter((c) => c.hour === hour && weekdaySet.has(c.day))
        .reduce((sum, c) => sum + (Number(c.count) || 0), 0)
    )
    const weekend = hourLabels.map((hour) =>
      cells
        .filter((c) => c.hour === hour && !weekdaySet.has(c.day))
        .reduce((sum, c) => sum + (Number(c.count) || 0), 0)
    )

    if (!cells.length) {
      return [
        { name: '工作日', data: hourLabels.map(() => 0), stack: 'total' },
        { name: '周末', data: hourLabels.map(() => 0), stack: 'total' }
      ]
    }

    void dayLabels
    return [
      { name: '工作日', data: workday, stack: 'total' },
      { name: '周末', data: weekend, stack: 'total' }
    ]
  })
</script>
