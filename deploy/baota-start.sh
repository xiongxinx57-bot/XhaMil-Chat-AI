#!/bin/bash
# 宝塔 Node 项目启动脚本（示例）
# 用法：把 PROJECT_ROOT 改成你服务器上的项目根目录绝对路径

PROJECT_ROOT="/www/wwwroot/YourChat"
cd "$PROJECT_ROOT/backend" || exit 1

# 宝塔 Node 一般在 /www/server/nodejs/ 下，按面板安装的版本改 vXX
export PATH="/www/server/nodejs/v20.11.0/bin:$PATH"

if [ ! -d node_modules ]; then
  npm install --production
fi

exec node src/index.js
