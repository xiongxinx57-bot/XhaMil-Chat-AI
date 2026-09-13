<!-- 顶部四宫格：视觉对齐 Art console card-list -->
<template>
  <ElRow :gutter="20" class="flex">
    <ElCol v-for="(item, index) in dataList" :key="index" :sm="12" :md="6" :lg="6">
      <div class="art-card relative flex flex-col justify-center h-35 px-5 mb-5 max-sm:mb-4">
        <span class="text-g-700 text-sm">{{ item.des }}</span>
        <ArtCountTo class="text-[26px] font-medium mt-2" :target="item.num" :duration="1300" />
        <div class="flex-c mt-1">
          <span class="text-xs text-g-600">{{ item.subLabel }}</span>
          <span
            class="ml-1 text-xs font-semibold"
            :class="item.subTone === 'danger' ? 'text-danger' : 'text-success'"
          >
            {{ item.subValue }}
          </span>
        </div>
        <div
          class="absolute top-0 bottom-0 right-5 m-auto size-12.5 rounded-xl flex-cc bg-theme/10"
        >
          <ArtSvgIcon :icon="item.icon" class="text-xl text-theme" />
        </div>
      </div>
    </ElCol>
  </ElRow>
</template>

<script setup lang="ts">
  import type { WorkbenchStats } from '../types'

  const props = defineProps<{
    stats: WorkbenchStats
  }>()

  const dataList = computed(() => [
    {
      des: '用户总数',
      icon: 'ri:user-line',
      num: props.stats.totalUsers,
      subLabel: '今日新增',
      subValue: `+${props.stats.todayUsers}`,
      subTone: 'success' as const
    },
    {
      des: '群聊数',
      icon: 'ri:group-line',
      num: props.stats.totalGroups,
      subLabel: '私聊会话',
      subValue: String(props.stats.totalDirectChats),
      subTone: 'success' as const
    },
    {
      des: '消息总量',
      icon: 'ri:mail-line',
      num: props.stats.totalMessages,
      subLabel: '今日消息',
      subValue: String(props.stats.todayMessages),
      subTone: 'success' as const
    },
    {
      des: '活跃用户',
      icon: 'ri:progress-2-line',
      num: props.stats.activeUsers,
      subLabel: '封禁',
      subValue: String(props.stats.bannedUsers),
      subTone: (props.stats.bannedUsers > 0 ? 'danger' : 'success') as 'danger' | 'success'
    }
  ])
</script>
