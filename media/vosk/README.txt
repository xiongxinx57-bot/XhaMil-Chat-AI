# 离线语音转文字模型（Vosk 中文小模型）

本目录已放置：
  vosk-model-small-cn-0.22.zip（约 42MB）

后端静态目录会直接提供：
  {服务器地址}/media/vosk/vosk-model-small-cn-0.22.zip

App 首次转文字时会优先从当前登录的服务器下载该文件。
本地示例（已验证）：
  http://127.0.0.1:5000/media/vosk/vosk-model-small-cn-0.22.zip

若手机连的是线上域名（如 ask.xhamil.com），需把同一份 zip
同步到线上机器的 media/vosk/ 目录。

备用下载源：
  https://hf-mirror.com/rhasspy/vosk-models/resolve/main/zh/vosk-model-small-cn-0.22.zip
  https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip

可选：把同一份 zip 放到 App 的
  app/src/main/assets/vosk/vosk-model-small-cn-0.22.zip
即可免下载，安装后本地解压。
