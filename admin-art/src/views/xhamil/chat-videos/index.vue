<!-- 聊天视频管理 -->
<template>
  <MediaBrowser
    title="聊天视频"
    subtitle="聊天消息中的视频文件"
    kind="video"
    :load-fn="loadFn"
    :delete-fn="deleteFn"
    :delete-all-fn="deleteAllFn"
  />
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import MediaBrowser from '../media/MediaBrowser.vue'

  defineOptions({ name: 'XhamilChatVideos' })

  const loadFn = () => xhamilApi.getChatVideos()
  const deleteFn = (filename: string) => xhamilApi.deleteChatVideo(filename)
  const deleteAllFn = () => xhamilApi.deleteAllChatVideos()
</script>
