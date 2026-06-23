#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_URL="http://localhost:8080"
HEALTH_URL="$APP_URL/api/v1/health/live"

info() {
  printf "\033[1;34m[NovaMall]\033[0m %s\n" "$1"
}

warn() {
  printf "\033[1;33m[NovaMall]\033[0m %s\n" "$1"
}

fail() {
  printf "\033[1;31m[NovaMall]\033[0m %s\n" "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "未找到 Docker，请先安装并启动 Docker Desktop。"
docker info >/dev/null 2>&1 || fail "Docker 当前不可用，请确认 Docker Desktop 已启动。"

if [ ! -f ".env" ]; then
  warn "未发现 .env，将使用 docker-compose.yml 中的课程演示默认值。"
  warn "如需自定义密钥，可复制 .env.example 为 .env 后再启动。"
fi

info "校验 Docker Compose 配置..."
docker compose config >/dev/null

info "构建并启动 MySQL、迁移任务、后端和前端..."
docker compose up --build -d

info "等待后端健康检查通过..."
for attempt in {1..30}; do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null 2>&1; then
    info "系统启动成功：$APP_URL"
    info "查看日志：docker compose logs -f"
    info "停止系统：docker compose down"
    exit 0
  fi

  if [ "$attempt" -eq 30 ]; then
    break
  fi

  sleep 2
done

warn "容器已启动，但健康检查暂未通过。可用以下命令查看原因："
warn "docker compose ps"
warn "docker compose logs -f backend frontend migrate mysql"
exit 1
