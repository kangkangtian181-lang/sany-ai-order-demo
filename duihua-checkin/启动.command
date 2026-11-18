#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动对画课时打卡…"
if command -v python3 >/dev/null 2>&1; then
  python3 server.py
elif command -v python >/dev/null 2>&1; then
  python server.py
else
  echo "未找到 Python 3，请先安装 Python 后再打开本文件。"
  read -r _
fi
