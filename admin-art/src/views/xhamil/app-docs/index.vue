<!-- 内置 App 使用文档（头像菜单入口） -->
<template>
  <div class="app-docs-page">
    <header class="docs-hero">
      <div class="hero-badge">XhaMil Chat</div>
      <h1>App 使用文档</h1>
      <p>手机端从连上服务器、注册登录，到聊天、群聊、说说的完整说明。</p>
    </header>

    <div class="docs-layout">
      <aside class="docs-toc">
        <div class="toc-title">目录</div>
        <button
          v-for="item in toc"
          :key="item.id"
          type="button"
          class="toc-item"
          :class="{ active: activeId === item.id }"
          @click="scrollTo(item.id)"
        >
          {{ item.title }}
        </button>
      </aside>

      <div class="docs-body">
        <section id="start" class="docs-section">
          <h2>1. 连接服务器</h2>
          <p>App 登录页默认不显示服务器地址。首次使用或更换服务器时，按下面步骤配置：</p>
          <ol class="step-list">
            <li>打开 App，进入登录页。</li>
            <li>
              连续点击欢迎语
              <strong>10 次</strong>
              （默认文案为「欢迎回来」）。
            </li>
            <li>进入选服页后，手动填写服务器地址（或扫描他人分享的配置码）。</li>
            <li>地址保存后按提示重启 App，即可回到登录页使用新服务器。</li>
          </ol>
          <ElAlert type="warning" :closable="false" show-icon class="mt-3">
            真机请使用电脑局域网 IP 或公网地址（如
            <code>192.168.x.x:5000</code>
            ），不要填
            <code>127.0.0.1</code>
            。
          </ElAlert>
        </section>

        <section id="auth" class="docs-section">
          <h2>2. 注册与登录</h2>
          <div class="card-grid">
            <article class="info-card">
              <h3>注册</h3>
              <ul>
                <li>账户名 3–32 位。</li>
                <li>密码至少 6 位，两次输入需一致。</li>
                <li>填写邮箱并获取验证码完成校验。</li>
                <li>若服务器开启极验，需先完成行为验证。</li>
              </ul>
            </article>
            <article class="info-card">
              <h3>登录</h3>
              <ul>
                <li>可用<strong>账户名</strong>或<strong>聊聊号</strong>登录。</li>
                <li>登录成功后进入会话列表。</li>
                <li>若开启入群门禁，首次进入需加入指定群后才能使用。</li>
              </ul>
            </article>
          </div>
        </section>

        <section id="tabs" class="docs-section">
          <h2>3. 底部四个标签</h2>
          <div class="tab-grid">
            <div class="tab-item">
              <ArtSvgIcon icon="ri:chat-3-line" />
              <strong>聊天</strong>
              <span>会话列表、私聊与群聊入口</span>
            </div>
            <div class="tab-item">
              <ArtSvgIcon icon="ri:chat-quote-line" />
              <strong>说说</strong>
              <span>发布动态、浏览好友说说</span>
            </div>
            <div class="tab-item">
              <ArtSvgIcon icon="ri:contacts-book-line" />
              <strong>通讯录</strong>
              <span>好友列表、搜索联系人</span>
            </div>
            <div class="tab-item">
              <ArtSvgIcon icon="ri:user-3-line" />
              <strong>我的</strong>
              <span>资料、通知、设置、帮助与关于</span>
            </div>
          </div>
        </section>

        <section id="chat" class="docs-section">
          <h2>4. 聊天</h2>
          <p>会话页左上角菜单可加好友或加入群聊。进入会话后可发送文字、表情、图片、视频、语音和文件。</p>
          <ul class="feature-list">
            <li>
              <strong>图片 / 视频：</strong>
              从相册选择，支持拍摄、预览、涂鸦、贴纸、文字、裁剪、马赛克。多张图片可选「发送后合并展示」。
            </li>
            <li>
              <strong>文件：</strong>
              聊天页「+」→ 文件。群聊中可由群主设置全员上传或仅管理员上传。
            </li>
            <li>
              <strong>位置：</strong>
              聊天页「+」→ 位置，分享当前位置。
            </li>
            <li>
              <strong>置顶 / 免打扰：</strong>
              进入聊天信息页可置顶会话、关闭消息预览或提示音。
            </li>
            <li>
              <strong>聊天背景：</strong>
              私聊信息页可设置仅本机可见的聊天背景。
            </li>
            <li>
              <strong>@AI：</strong>
              群内若配置了 AI 机器人，可点输入栏上方提示插入 @ 机器人。
            </li>
          </ul>
        </section>

        <section id="group" class="docs-section">
          <h2>5. 群聊</h2>
          <p>可通过群号搜索加入，或由好友邀请进群。群主/管理员可修改群名称、发布公告、管理成员。群头像由系统按成员自动生成组合头像，不可更换。</p>
          <div class="card-grid">
            <article class="info-card">
              <h3>成员与权限</h3>
              <ul>
                <li>查看成员、邀请好友、批量加好友、移除成员。</li>
                <li>设管理员、禁言、踢出，可选「踢出并拉黑」。</li>
                <li>黑名单用户无法再搜索或申请加入本群。</li>
                <li>可设置本群昵称、群备注（仅自己可见）。</li>
              </ul>
            </article>
            <article class="info-card">
              <h3>群管家与公告</h3>
              <ul>
                <li>开启群管家后自动发送入群欢迎、退群提醒，并过滤违禁词。</li>
                <li>欢迎词可附带图片。</li>
                <li>公告支持文字和图片，可置顶到聊天页横幅。</li>
                <li>群主可开启「你画我猜」或「多人聊天（语音房）」。</li>
              </ul>
            </article>
          </div>
        </section>

        <section id="play" class="docs-section">
          <h2>6. 你画我猜与多人聊天</h2>
          <ul class="feature-list">
            <li>
              <strong>你画我猜：</strong>
              仅已开放该功能的群、且由群主开启。设置人数后人满自动开始；作画者选词作画，其他人在倒计时内猜词。群内可查看总分榜。
            </li>
            <li>
              <strong>多人聊天：</strong>
              群主开启语音房后，成员点击进入连麦。支持麦克风、扬声器、降噪、背景音乐和房间公告。
            </li>
          </ul>
        </section>

        <section id="moments" class="docs-section">
          <h2>7. 说说</h2>
          <p>在「说说」页发布文字和图片动态，浏览好友动态。图片会同步到后台「说说图片」资源库。</p>
        </section>

        <section id="contacts" class="docs-section">
          <h2>8. 通讯录与好友</h2>
          <ul class="feature-list">
            <li>通讯录可搜索好友，点击进入资料或会话。</li>
            <li>好友申请在消息通知中处理，通过后才会出现会话。</li>
            <li>私聊信息页可查看资料或删除好友（聊天记录一并删除）。</li>
          </ul>
        </section>

        <section id="me" class="docs-section">
          <h2>9. 我的</h2>
          <div class="card-grid">
            <article class="info-card">
              <h3>常用入口</h3>
              <ul>
                <li>消息通知：好友申请、系统提醒。</li>
                <li>个性设置、提示音管理、通用设置。</li>
                <li>帮助与客服：QQ / 微信（后台可配置）。</li>
                <li>关于：版本号与致谢信息。</li>
              </ul>
            </article>
            <article class="info-card">
              <h3>聊聊号</h3>
              <ul>
                <li>个人页展示「聊聊号」，可用于登录和添加好友。</li>
                <li>群聊有独立群号，可复制后分享给他人搜索加入。</li>
              </ul>
            </article>
          </div>
        </section>

        <section id="faq" class="docs-section">
          <h2>10. 常见问题</h2>
          <div class="faq-list">
            <div class="faq-item">
              <h3>连不上服务器？</h3>
              <p>确认手机和服务器在同一网络，或已使用公网地址；保存地址后必须重启 App。</p>
            </div>
            <div class="faq-item">
              <h3>收不到邮箱验证码？</h3>
              <p>到后台「注册验证」检查发信配置，并确认邮箱未被拦截。可使用测试发信功能排查。</p>
            </div>
            <div class="faq-item">
              <h3>消息被打码或发不出去？</h3>
              <p>群管家或全局违禁词可能命中了内容。管理员可在「违禁词」中调整词库与掩码。</p>
            </div>
            <div class="faq-item">
              <h3>找不到你画我猜？</h3>
              <p>需后台为该群分配「你画我猜」功能，且由群主在群内开启。未分配时会提示本群暂未开放。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useRouter } from 'vue-router'

  defineOptions({ name: 'XhamilAppDocs' })

  const router = useRouter()

  const toc = [
    { id: 'start', title: '连接服务器' },
    { id: 'auth', title: '注册与登录' },
    { id: 'tabs', title: '底部标签' },
    { id: 'chat', title: '聊天' },
    { id: 'group', title: '群聊' },
    { id: 'play', title: '你画我猜 / 语音房' },
    { id: 'moments', title: '说说' },
    { id: 'contacts', title: '通讯录' },
    { id: 'me', title: '我的' },
    { id: 'faq', title: '常见问题' }
  ]

  const activeId = ref(toc[0].id)

  const scrollTo = (id: string) => {
    activeId.value = id
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goPage = (path: string) => {
    router.push(path)
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .app-docs-page {
    padding-bottom: 32px;
  }

  .docs-hero {
    padding: 28px 32px;
    margin-bottom: 20px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--el-color-primary) 12%, transparent), transparent 60%),
      var(--art-main-bg-color, #fff);
    border: 1px solid var(--art-border-color, #ebeef5);
  }

  .hero-badge {
    display: inline-block;
    margin-bottom: 10px;
    padding: 2px 10px;
    font-size: 12px;
    letter-spacing: 0.08em;
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
    border-radius: 999px;
  }

  .docs-hero h1 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 650;
    color: var(--art-gray-900, #1d2129);
  }

  .docs-hero p {
    margin: 0;
    font-size: 14px;
    color: var(--art-gray-500, #86909c);
  }

  .docs-layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .docs-toc {
    position: sticky;
    top: 12px;
    padding: 16px 12px;
    border-radius: 12px;
    background: var(--art-main-bg-color, #fff);
    border: 1px solid var(--art-border-color, #ebeef5);
  }

  .toc-title {
    padding: 0 8px 10px;
    font-size: 12px;
    color: var(--art-gray-500, #86909c);
  }

  .toc-item {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    font-size: 13px;
    color: var(--art-gray-700, #4e5969);
    cursor: pointer;
  }

  .toc-item:hover,
  .toc-item.active {
    color: var(--el-color-primary);
    background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  }

  .docs-body {
    min-width: 0;
  }

  .docs-section {
    padding: 22px 24px;
    margin-bottom: 16px;
    border-radius: 12px;
    background: var(--art-main-bg-color, #fff);
    border: 1px solid var(--art-border-color, #ebeef5);
    scroll-margin-top: 12px;
  }

  .docs-section h2 {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 600;
  }

  .docs-section p,
  .docs-section li {
    font-size: 14px;
    line-height: 1.7;
    color: var(--art-gray-700, #4e5969);
  }

  .docs-section p {
    margin: 0 0 12px;
  }

  .step-list,
  .feature-list {
    margin: 0;
    padding-left: 20px;
  }

  .step-list li + li,
  .feature-list li + li {
    margin-top: 8px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .info-card {
    padding: 16px;
    border-radius: 10px;
    background: var(--art-gray-100, #f7f8fa);
  }

  .info-card h3 {
    margin: 0 0 10px;
    font-size: 15px;
  }

  .info-card ul {
    margin: 0;
    padding-left: 18px;
  }

  .info-card li + li {
    margin-top: 6px;
  }

  .tab-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .tab-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    border-radius: 10px;
    background: var(--art-gray-100, #f7f8fa);
  }

  .tab-item .art-svg-icon {
    font-size: 20px;
    color: var(--el-color-primary);
  }

  .tab-item span {
    font-size: 12px;
    color: var(--art-gray-500, #86909c);
  }

  .faq-item + .faq-item {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--art-border-color, #ebeef5);
  }

  .faq-item h3 {
    margin: 0 0 6px;
    font-size: 14px;
  }

  .faq-item p {
    margin: 0;
  }

  code {
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 12px;
    background: var(--art-gray-200, #e5e6eb);
  }

  @media (max-width: 960px) {
    .docs-layout,
    .card-grid,
    .tab-grid {
      grid-template-columns: 1fr;
    }

    .docs-toc {
      position: static;
    }
  }
</style>
