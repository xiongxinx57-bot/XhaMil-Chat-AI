# XhaMil Chat AI

自托管即时通讯服务端：**Node.js API** + **Vue 管理后台**（`admin-art`）。

客户端（Android / 桌面）连你自己的服务器地址即可使用，不绑定某一固定公网域名。

| 目录 | 说明 |
|------|------|
| `backend/` | Express API、WebSocket、媒体与业务逻辑 |
| `admin-art/` | 管理后台源码（Vite + Vue） |
| `json/` | 配置模板（仅 `config.example.json`） |
| `media/` | 静态/内置资源占位（用户上传不入库） |
| `deploy/` | 宝塔等启动脚本示例 |
| `docs/` | 部署与自建说明 |

---

## 环境要求

- **Node.js** 18+（推荐 20 LTS）
- **MySQL** 8.x（或兼容）
- **Redis**（可选，配置里可开关）
- Linux 服务器建议 ≥ 2 核 4G，开放 80/443

---

## 5 分钟本地跑通

```bash
git clone https://github.com/xiongxinx57-bot/XhaMil-Chat-AI.git
cd XhaMil-Chat-AI

# 1. 配置（勿提交真实 config）
cp json/config.example.json json/config.json
# 编辑 json/config.json：数据库、管理员密码、publicSiteUrl 等

# 2. 启动 API
cd backend
npm install
npm start
# 默认监听 0.0.0.0:5000（以 config 为准）
```

健康检查（示例）：

```text
http://127.0.0.1:5000/api/health
```

### 管理后台（开发）

```bash
cd admin-art
cp .env.example .env          # 若尚无 .env
cp .env.development.example .env.development
pnpm install   # 或 npm install
pnpm dev       # 默认端口见 .env（如 5174）
```

生产构建（产物进 `backend/public/admin`，与 Node 同域）：

```bash
cd backend
npm run build:admin
```

更完整的服务器 / 宝塔 / Nginx / 客户端填地址说明见 **[docs/DEPLOY.md](docs/DEPLOY.md)**。

---

## 配置约定

- 仓库**只包含** `json/config.example.json`。
- 真实 `json/config.json`、密钥、`.env`、聊天附件、会话文件已在 `.gitignore` 中排除。
- 短信 / 邮件 / 验证码 / AI Key 等一律写在服务端配置，不要写进客户端。

---

## 客户端如何连你的服

1. 部署好本仓库并保证 `https://你的域名/api/health` 可访问。  
2. 在桌面端登录页填写 API 根地址（不要带 `/api` 后缀）。  
3. Android：数据层已支持 `baseUrl`；登录页显式切换 UI 按开源计划补齐。  
4. 更换服务器后需重新登录。

正确示例：`https://chat.example.com`  
错误示例：`https://chat.example.com/api`

---

## 品牌与二开

- 本仓库为服务端开源快照，便于自建与学习。  
- 二开产品是否继续使用「XhaMil」名称，请自行遵守商标与许可约定；默认建议改用自有品牌。  
- 请勿把他人生产环境的域名、密钥或用户数据带进公开仓库。

---

## License

根目录采用 [MIT License](LICENSE)。`admin-art` 等子目录若自带 LICENSE，以该子目录声明为准（上游模板版权保留）。

