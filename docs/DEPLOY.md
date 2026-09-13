# 自建部署指南

面向会用宝塔 / Nginx / 基本 Linux 的站长。本文不含任何真实生产密码、IP 或第三方 Key。

---

## 1. 准备

| 项 | 说明 |
|----|------|
| Linux 服务器 | 建议 2 核 4G+；开放 80/443 |
| 域名 | 解析到服务器，配置 HTTPS |
| Node.js | 18+（推荐 20） |
| MySQL | 新建空库与账号 |
| Redis | 可选；在 `config.json` 开关 |

建议目录（名称可自定）：

```text
/www/wwwroot/YourChat/
  backend/
  admin-art/          # 仅构建时需要
  json/config.json    # 由 example 复制
  media/
  deploy/
```

---

## 2. 安装与配置

```bash
git clone https://github.com/xiongxinx57-bot/XhaMil-Chat-AI.git /www/wwwroot/YourChat
cd /www/wwwroot/YourChat

cp json/config.example.json json/config.json
```

编辑 `json/config.json`，至少检查：

1. `server.port` / `server.host`
2. `admin.username` / `admin.password`（务必改掉默认）
3. `database.*`（主机、库名、账号密码）
4. `redis.*`（若启用）
5. `publicSiteUrl`（对外站点根，如 `https://chat.example.com`）
6. 短信 / 邮件 / 验证码等按需填写（Key 只放服务端）

```bash
cd backend
npm install --production
npm start
# 或用 pm2 / 宝塔 Node 项目 / deploy/baota-start.sh
```

宝塔启动脚本示例：复制 `deploy/baota-start.sh`，把 `PROJECT_ROOT` 改成你的绝对路径，Node 版本路径按面板实际修改。

---

## 3. 反向代理（Nginx 概念）

- 公网 `https://你的域名` → `http://127.0.0.1:5000`（端口以 config 为准）
- 上传与 WebSocket 需要足够的超时与缓冲；长连接路径需允许 Upgrade
- 静态媒体若由 Nginx 直接提供，需与后端 `media` 目录及 URL 规则一致

验证：

```text
[ ] https://域名/api/health
[ ] 管理后台可打开并登录
[ ] 注册 / 登录正常
[ ] 上传一张图，URL 可访问
[ ] 两台客户端填同一地址能互发消息
```

---

## 4. 管理后台构建

开发：

```bash
cd admin-art
cp .env.example .env
cp .env.development.example .env.development
pnpm install && pnpm dev
```

生产（与 Node 同域）：

```bash
cd backend
npm run build:admin
# 访问 https://域名/admin/ （以实际路由为准）
```

---

## 5. 客户端填服务器地址

- 填**站点根**，不要带 `/api`
- 生产请用 HTTPS；仅内网调试可用 `http://IP:端口`
- 换服务器后重新登录（旧 Token 无效）

桌面端：登录页已有 API / 网络地址输入。  
Android：`SessionStore.baseUrl` 已支持；登录页输入切换按产品规划补齐。

---

## 6. 常见问题

| 现象 | 排查 |
|------|------|
| 客户端连不上 | DNS、证书、防火墙、是否误填 `/api` |
| 能登录但图片裂 | `media` 目录权限、Nginx 静态、`publicSiteUrl` |
| 仅自家 Wi‑Fi 可用 | 填了内网 IP；外网需域名或公网映射 |
| 短信 / 位置失败 | 对应服务端 Key 未配或功能未开 |

---

## 7. 安全提醒

- 不要把真实 `config.json`、`.env`、用户媒体推送到 Git
- 首次部署立刻修改管理员密码
- 生产关闭不必要的调试开关与开放注册策略按需收紧
