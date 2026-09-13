<template>
  <div class="art-card h-82 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>客户端分布</h4>
      </div>
    </div>

    <ArtRingChart
      :data="ringData"
      :color="ringColors"
      :radius="['46%', '60%']"
    />
  </div>
</template>

<script setup lang="ts">
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  const ringData = computed(() => {
    const list = (props.overview.clientInsights || []).filter((item) => Number(item.count) > 0)
    if (!list.length) {
      return [{ value: 1, name: '暂无' }]
    }
    return list.map((item) => ({
      value: Number(item.count) || 0,
      name: item.name
    }))
  })

  const ringColors = computed(() => {
    const list = (props.overview.clientInsights || []).filter((item) => Number(item.count) > 0)
    if (!list.length) return ['#4C87F3', '#93F1B4', '#8BD8FC']
    return list.map((item) => item.color || '#4C87F3')
  })
</script>
