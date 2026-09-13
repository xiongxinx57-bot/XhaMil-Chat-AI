<!-- 聊天语音管理 -->
<template>
  <MediaBrowser
    title="聊天语音"
    subtitle="聊天消息中的语音文件"
    kind="audio"
    :load-fn="loadFn"
    :delete-fn="deleteFn"
  />
</template>

<script setup lang="ts">
  import { xhamilApi } from '@/api/xhamil'
  import MediaBrowser from '../media/MediaBrowser.vue'

  defineOptions({ name: 'XhamilChatVoice' })

  const loadFn = () => xhamilApi.getChatVoiceFiles()
  const deleteFn = (filename: string) => xhamilApi.deleteChatVoiceFile(filename)
</script>
