<template>
  <div class="art-card h-100 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>目标与实际</h4>
      </div>
    </div>

    <ArtBarChart
      class="p-5"
      height="12rem"
      :data="revenueData"
      :xAxisData="weekDays"
      :showAxisLine="false"
      barWidth="28%"
    />

    <div class="px-5 mt-4">
      <div v-for="item in totalItems" :key="item.label" class="flex-c mb-5 last:mb-0">
        <div class="flex-c justify-start w-3/5 text-sm">
          <div class="w-10 h-10 mr-3 text-lg rounded-md flex-cc" :class="item.iconClass">
            <ArtSvgIcon :icon="item.icon" />
          </div>

          <div class="flex flex-col items-start">
            <span class="text-base text-g-800">{{ item.label }}</span>
            <span class="mt-1 text-xs text-g-500">{{ item.subLabel }}</span>
          </div>
        </div>
        <div class="text-lg font-normal" :class="item.valueClass">{{ item.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  const weekDays = computed(() => {
    const trend = props.overview.messageTrend
    if (trend.length) return trend.map((item) => item.name)
    return ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  })

  const revenueData = computed(() => {
    const values = props.overview.messageTrend.map((item) => Number(item.value) || 0)
    return [
      {
        name: '消息量',
        data: values.length ? values : [0, 0, 0, 0, 0, 0, 0]
      }
    ]
  })

  const totalItems = computed(() => {
    const { stats, messageTrend, sessionDuration } = props.overview
    const values = messageTrend.map((item) => Number(item.value) || 0)
    const avg =
      values.length > 0
        ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length)
        : 0
    const target = Math.max(avg, stats.todayMessages, 1)

    return [
      {
        icon: 'ri:chat-3-line',
        iconClass: 'text-theme bg-theme/12',
        label: '今日消息',
        subLabel: '实际',
        value: String(stats.todayMessages).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        valueClass: 'text-theme'
      },
      {
        icon: 'ri:flag-line',
        iconClass: 'text-theme bg-theme/12',
        label: '日均目标',
        subLabel: sessionDuration.avgLabel || '近 7 日均量',
        value: String(target).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
        valueClass: 'text-theme'
      }
    ]
  })
</script>
