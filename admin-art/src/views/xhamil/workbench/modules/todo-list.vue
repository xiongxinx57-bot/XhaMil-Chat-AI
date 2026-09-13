<!-- 待办：由 overview 统计生成的运维事项 -->
<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>待办事项</h4>
        <p>
          待处理
          <span class="text-danger">{{ pendingCount }}</span>
        </p>
      </div>
    </div>

    <div class="h-[calc(100%-40px)] overflow-auto">
      <ElScrollbar>
        <div v-if="!list.length" class="flex-cb h-17.5 text-sm text-g-500">暂无待办</div>
        <div
          v-for="item in list"
          :key="item.key"
          class="flex-cb h-17.5 border-b border-g-300 text-sm last:border-b-0"
        >
          <div class="min-w-0 pr-3">
            <p class="text-sm truncate">{{ item.title }}</p>
            <p class="text-g-500 mt-1">{{ item.date }}</p>
          </div>
          <ElCheckbox v-model="doneMap[item.key]" />
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { WorkbenchStats } from '../types'

  const props = defineProps<{
    stats: WorkbenchStats
  }>()

  const doneMap = reactive<Record<string, boolean>>({})

  const list = computed(() => {
    const s = props.stats
    const items: { key: string; title: string; date: string }[] = []
    if (s.pendingFriendRequests > 0) {
      items.push({
        key: 'friend',
        title: `处理 ${s.pendingFriendRequests} 条待处理好友申请`,
        date: '好友关系'
      })
    }
    if (s.bannedUsers > 0) {
      items.push({
        key: 'banned',
        title: `复核 ${s.bannedUsers} 个封禁用户`,
        date: '用户管理'
      })
    }
    if (s.todayMessages > 0) {
      items.push({
        key: 'todayMsg',
        title: `查看今日 ${s.todayMessages} 条消息概况`,
        date: '消息监控'
      })
    }
    if (s.aiBots === 0) {
      items.push({ key: 'ai', title: '配置至少一个群 AI', date: '群 AI' })
    } else {
      items.push({ key: 'aiOk', title: `巡检 ${s.aiBots} 个群 AI 配置`, date: '群 AI' })
    }
    items.push({
      key: 'groups',
      title: `巡检 ${s.totalGroups} 个群聊状态`,
      date: '群聊管理'
    })
    items.push({ key: 'verify', title: '检查邮箱 / 极验开关', date: '系统配置' })
    for (const item of items) {
      if (doneMap[item.key] === undefined) doneMap[item.key] = false
    }
    return items
  })

  const pendingCount = computed(() => list.value.filter((i) => !doneMap[i.key]).length)
</script>
