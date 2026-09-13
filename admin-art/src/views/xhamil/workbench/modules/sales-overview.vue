<!-- 消息趋势：对齐 Art 访问量卡片 -->
<template>
  <div class="art-card h-105 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>消息趋势</h4>
        <p>
          近 7 日
          <span class="text-success">共 {{ total }}</span>
        </p>
      </div>
    </div>
    <ArtLineChart
      height="calc(100% - 56px)"
      :data="chartData"
      :xAxisData="xAxisData"
      :showAreaColor="true"
      :showAxisLine="false"
    />
  </div>
</template>

<script setup lang="ts">
  import type { WorkbenchTrendPoint } from '../types'

  const props = defineProps<{
    trend: WorkbenchTrendPoint[]
  }>()

  const xAxisData = computed(() =>
    props.trend?.length ? props.trend.map((i) => i.name) : ['—']
  )
  const chartData = computed(() =>
    props.trend?.length ? props.trend.map((i) => Number(i.value) || 0) : [0]
  )
  const total = computed(() => chartData.value.reduce((a, b) => a + b, 0))
</script>
