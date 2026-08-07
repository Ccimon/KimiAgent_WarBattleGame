#!/bin/bash
# Tower Battle 一键启动:双击本文件即可启动开发服务器并打开游戏页面
cd "$(dirname "$0")" || exit 1

PORT=5173
URL="http://localhost:$PORT/"

# 服务器已在运行:直接打开页面
if curl -s -o /dev/null --max-time 1 "$URL"; then
  echo "服务器已在运行,直接打开游戏页面…"
  open "$URL"
  exit 0
fi

# 首次运行:安装依赖
if [ ! -d node_modules ]; then
  echo "首次运行,正在安装依赖…"
  npm install || exit 1
fi

# 后台等待服务器就绪后打开浏览器
(
  while ! curl -s -o /dev/null --max-time 1 "$URL"; do
    sleep 0.3
  done
  open "$URL"
) &

echo "正在启动服务器,浏览器将自动打开 $URL"
echo "关闭本窗口即可停止服务器。"
npm run dev
