<!-- 动态：最近消息 -->
<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>动态</h4>
        <p>
          最近消息
          <span class="text-success">+{{ messages.length }}</span>
        </p>
      </div>
    </div>

    <div class="h-9/10 mt-2 overflow-hidden">
      <ElScrollbar>
        <div
          v-if="!messages.length"
          class="h-17.5 leading-17.5 text-sm text-g-500"
        >
          暂无最近消息
        </div>
        <div
          v-for="item in list"
          :key="item.id"
          class="h-17.5 leading-17.5 border-b border-g-300 text-sm overflow-hidden last:border-b-0"
        >
          <span class="text-g-800 font-medium">{{ item.username }}</span>
          <span class="mx-2 text-g-600">{{ item.type }}</span>
          <span class="text-theme">{{ item.target }}</span>
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { WorkbenchRecentMessage } from '../types'

  const props = defineProps<{
    messages: WorkbenchRecentMessage[]
  }>()

  const list = computed(() =>
    (props.messages || []).map((m) => {
      const room = m.conversationTitle || '会话'
      const isGroup = String(m.convType || '') === 'group'
      return {
        id: m.id,
        username: m.userName || '用户',
        type: isGroup ? '在群聊发送' : '私聊发送',
        target: m.content || m.messageTypeLabel || room
      }
    })
  )
</script>
