<template>
  <div class="art-card h-82 p-5 mb-5 overflow-hidden max-lg:h-auto max-sm:mb-4">
    <div class="art-card-header pr-0">
      <div class="title">
        <h4>今日概况</h4>
        <p>聊天核心指标</p>
      </div>
      <div class="flex-cc h-7.5 min-w-17 border border-g-300 rounded-lg text-g-500">
        <ArtSvgIcon icon="ri:refresh-line" class="text-base mr-1.5" />
        <span class="text-xs">实时</span>
      </div>
    </div>

    <div class="mt-2">
      <ElRow :gutter="20">
        <ElCol :span="6" :xs="24" v-for="(item, index) in salesData" :key="index">
          <div
            class="flex px-5 flex-col justify-center h-55 border border-g-300/85 rounded-xl max-lg:mb-4 max-sm:flex-row max-sm:justify-between max-sm:items-center max-sm:h-40"
          >
            <div class="size-12 rounded-lg flex-cc bg-theme/10">
              <ArtSvgIcon :icon="item.icon" class="text-xl text-theme" />
            </div>

            <div class="max-sm:ml-4 mt-3.5 max-sm:mt-0 max-sm:text-end">
              <ArtCountTo class="text-2xl font-medium" :target="item.value" :duration="1500" />
              <p class="mt-2 text-base text-g-600 max-sm:mt-1">{{ item.label }}</p>
              <small class="text-g-500 mt-1 max-sm:mt-0.5">
                {{ item.hint }}
                <span
                  class="font-medium"
                  :class="item.change.indexOf('-') === 0 ? 'text-danger' : 'text-success'"
                  >{{ item.change }}</span
                >
              </small>
            </div>
          </div>
        </ElCol>
      </ElRow>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { AnalysisOverview } from '../types'

  const props = defineProps<{
    overview: AnalysisOverview
  }>()

  function formatChange(current: number, previous: number): string {
    if (previous <= 0) return current > 0 ? '+100%' : '0%'
    const pct = Math.round(((current - previous) / previous) * 100)
    return pct >= 0 ? `+${pct}%` : `${pct}%`
  }

  const salesData = computed(() => {
    const { stats, messageTrend } = props.overview
    const todayMsg = stats.todayMessages
    const yesterdayMsg =
      messageTrend.length >= 2
        ? Number(messageTrend[messageTrend.length - 2]?.value) || 0
        : 0

    return [
      {
        label: '消息总量',
        value: stats.totalMessages,
        hint: '较昨日消息',
        change: formatChange(todayMsg, yesterdayMsg),
        icon: 'ri:bar-chart-box-ai-line'
      },
      {
        label: '今日消息',
        value: todayMsg,
        hint: '较昨日',
        change: formatChange(todayMsg, yesterdayMsg),
        icon: 'ri:bar-chart-grouped-line'
      },
      {
        label: '群聊数',
        value: stats.totalGroups,
        hint: '私聊会话',
        change: String(stats.totalDirectChats),
        icon: 'ri:bar-chart-2-line'
      },
      {
        label: '新用户',
        value: stats.todayUsers,
        hint: '用户总数',
        change: String(stats.totalUsers),
        icon: 'ri:user-add-line'
      }
    ]
  })
</script>
