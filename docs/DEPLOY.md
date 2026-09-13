# XhaMil Chat AI 部署指南

本文说明如何在自有服务器上部署本仓库提供的服务端与管理后台。文中不包含任何真实生产密码、内网地址或第三方密钥。

完整能力概览与技术栈见仓库根目录 [README.md](../README.md)。

---

## 1. 架构概览

```text
客户端（Android / 桌面）
        │  HTTPS + WebSocket
        ▼
反向代理（Nginx / 宝塔 等）  ──►  Node.js API（backend）
                                      │
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                     MySQL         Redis*        media/
                   （必需）       （可选）     （本地文件）
```

\* Redis 是否启用由 `json/config.json` 决定。

管理后台生产构建产物位于 `backend/public/admin`，建议与 API **同域**访问，避免跨域与 Cookie / 鉴权复杂度。

---

## 2. 环境准备

| 项目 | 要求 |
| --- | --- |
| 服务器 | Linux 推荐；建议 ≥ 2 核 4 GB 内存 |
| 公网访问 | 生产环境建议域名 + HTTPS（证书可用 Let’s Encrypt 等） |
| Node.js | 18+（推荐 20 LTS）；管理端构建建议 Node ≥ 20.19 |
| MySQL | 8.x 或兼容版本；预先创建空库与账号 |
| Redis | 可选 |
| 进程守护 | systemd、pm2 或宝塔「Node 项目」均可 |
| 防火墙 | 放行 80 / 443；API 进程端口仅对本机或内网开放更佳 |

建议目录布局（路径可自定）：

```text
/www/wwwroot/YourChat/
  backend/
  admin-art/           # 仅在需要重新构建管理端时使用
  json/config.json     # 由 config.example.json 复制并填写
  media/
  deploy/
```

---

## 3. 获取代码与基础配置

```bash
git clone https://github.com/xiongxinx57-bot/XhaMil-Chat-AI.git /www/wwwroot/YourChat
cd /www/wwwroot/YourChat

cp json/config.example.json json/config.json
```

编辑 `json/config.json`，至少完成下列项：

| 配置项 | 说明 |
| --- | --- |
| `server.host` / `server.port` | API 监听地址与端口 |
| `admin.username` / `admin.password` | 管理后台口令（**务必修改默认值**） |
| `database.*` | MySQL 主机、端口、库名、用户名、密码 |
| `redis.*` | 若启用缓存，填写连接信息 |
| `publicSiteUrl` | 对外访问根地址，例如 `https://chat.example.com` |
| 短信 / 邮件 / 验证码 / 其他 Key | 按实际启用的功能填写；未使用可保持关闭或留空 |

安全约定：

- 不要将真实 `config.json`、`.env` 推送到公开仓库。
- 第三方密钥仅存放于服务端配置。

---

## 4. 安装依赖并启动 API

```bash
cd /www/wwwroot/YourChat/backend
npm install --production
npm start
```

开发调试可使用：

```bash
npm run dev
```

### 使用宝塔 Node 项目

1. 在面板中新建 Node 项目，启动文件指向 `backend` 入口（或使用仓库提供的启动脚本）。
2. 可参考 `deploy/baota-start.sh`：将 `PROJECT_ROOT` 改为实际绝对路径，并按面板安装的 Node 版本修正 `PATH`。
3. 确认进程在面板中保持「运行」状态，并查看启动日志排查数据库连接失败等问题。

### 使用 pm2（示例）

```bash
cd /www/wwwroot/YourChat/backend
pm2 start src/index.js --name xhamil-chat
pm2 save
```

---

## 5. 反向代理与 HTTPS

将公网域名反向代理至本机 API 端口（以配置为准，常见为 `127.0.0.1:5000`）。

配置时注意：

| 要点 | 说明 |
| --- | --- |
| WebSocket | 需支持 `Upgrade` / `Connection` 头，并设置合理的读超时 |
| 上传体积 | 按业务调整 `client_max_body_size`（或等价项） |
| 静态媒体 | 若由 Nginx 直接提供 `media/`，路径与权限需与后端 URL 规则一致 |
| HTTPS | 生产环境强烈建议全站 HTTPS；客户端默认按安全上下文访问 |

Nginx 示意（仅作结构参考，请按实际域名与证书路径修改）：

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;

    # ssl_certificate     ...;
    # ssl_certificate_key ...;

    client_max_body_size 100m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

---

## 6. 管理后台构建与发布

### 开发模式

```bash
cd /www/wwwroot/YourChat/admin-art
cp .env.example .env
cp .env.development.example .env.development
pnpm install
pnpm dev
```

### 生产构建

```bash
cd /www/wwwroot/YourChat/backend
npm run build:admin
```

构建完成后，通过 `https://你的域名/admin/`（以实际路由为准）访问管理后台，使用 `config.json` 中的管理员账号登录。

---

## 7. 登录页更换服务器地址

服务端就绪后，用户在客户端**登录页面**填写自建地址即可接入，无需改源码。

| 端 | 说明 |
| --- | --- |
| Android App | 登录页可更换服务器地址 |
| 桌面端 | 登录页同样可更换服务器地址 |

填写规则：

| 规则 | 说明 |
| --- | --- |
| 填站点根 | 如 `https://chat.example.com`，不要带 `/api` |
| 协议 | 生产使用 HTTPS；内网调试可用 `http://IP:端口` |
| 换服后 | 需重新登录（旧会话对新库无效） |

---

## 8. 上线验收清单

部署完成后建议逐项确认：

```text
[ ] 管理后台可打开，并已使用新口令登录
[ ] 用户注册 / 登录流程正常
[ ] App / 桌面登录页可填写服务器地址并成功登录
[ ] 上传图片后资源链接可正常访问
[ ] 两台客户端可互发实时消息
[ ] （若启用）短信或邮件验证码可用
[ ] 443 已放行，证书有效
```

---

## 9. 常见问题

| 现象 | 可能原因与处理 |
| --- | --- |
| App / 桌面连不上 | DNS、证书、防火墙；登录页地址是否误带 `/api` |
| 能登录但图片无法显示 | `media` 权限、Nginx 静态映射、`publicSiteUrl` 与域名不一致 |
| 仅局域网可用 | 登录页填了内网 IP；外网需域名或端口映射 |
| 短信 / 邮件 / 定位失败 | 功能未开，或服务端 Key / 签名不完整 |
| 管理后台空白或 404 | 未执行 `build:admin`，或未代理 `/admin` |
| 进程反复退出 | 查日志：数据库连不上、端口占用或配置 JSON 有误 |

---

## 10. 安全基线

1. 首次部署立即修改管理员默认口令。  
2. 生产环境使用 HTTPS，数据库仅内网可达。  
3. 按需收紧注册策略与调试开关。  
4. 定期备份 MySQL 与必要的 `media` 数据。  
5. 升级前备份 `json/config.json` 与数据库，便于回滚。

---

## 11. 参考命令速查

```bash
# 配置
cp json/config.example.json json/config.json

# API
cd backend && npm install --production && npm start

# 管理端生产构建
cd backend && npm run build:admin
```
