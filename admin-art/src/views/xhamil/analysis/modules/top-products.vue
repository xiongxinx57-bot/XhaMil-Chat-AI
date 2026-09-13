<template>
  <div class="art-card h-82 p-5 mb-5 overflow-hidden max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>消息类型</h4>
      </div>
    </div>
    <div class="overflow-auto h-full">
      <ArtTable
        :data="products"
        style="width: 100%"
        size="large"
        :border="false"
        :stripe="false"
        :header-cell-style="{ background: 'transparent' }"
      >
        <ElTableColumn prop="name" label="类型" width="120" />
        <ElTableColumn prop="popularity" label="占比">
          <template #default="scope">
            <ElProgress
              :percentage="scope.row.popularity"
              :color="getColor(scope.row.popularity)"
              :stroke-width="5"
              :show-text="false"
            />
          </template>
        </ElTableColumn>
        <ElTableColumn prop="sales" label="数量" width="90">
          <template #default="scope">
            <span
              :style="{
                color: getColor(scope.row.popularity),
                backgroundColor: `rgba(${hexToRgb(getColor(scope.row.popularity))}, 0.08)`,
                border: '1px solid',
                padding: '3px 6px',
                borderRadius: '4px',
                fontSize: '12px'
              }"
              >{{ scope.row.sales }}</span
            >
          </template>
        </ElTableColumn>
      </ArtTable>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { hexToRgb } from '@/utils/ui'
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  interface Product {
    name: string
    popularity: number
    sales: string
  }

  const COLOR_THRESHOLDS = {
    LOW: 25,
    MEDIUM: 50,
    HIGH: 75
  } as const

  const POPULARITY_COLORS = {
    LOW: '#00E096',
    MEDIUM: '#0095FF',
    HIGH: '#884CFF',
    VERY_HIGH: '#FE8F0E'
  } as const

  const products = computed<Product[]>(() => {
    const list = props.overview.messageTypes || []
    if (!list.length) {
      return [{ name: '暂无数据', popularity: 0, sales: '0' }]
    }
    return list.map((item) => ({
      name: item.name,
      popularity: Math.min(100, Math.round(Number(item.value) || 0)),
      sales: String(item.count ?? 0)
    }))
  })

  const getColor = (percentage: number): string => {
    if (percentage < COLOR_THRESHOLDS.LOW) return POPULARITY_COLORS.LOW
    if (percentage < COLOR_THRESHOLDS.MEDIUM) return POPULARITY_COLORS.MEDIUM
    if (percentage < COLOR_THRESHOLDS.HIGH) return POPULARITY_COLORS.HIGH
    return POPULARITY_COLORS.VERY_HIGH
  }
</script>
