#!/usr/bin/env bash
# Runs on the deploy server (dev/qa/prod). Uploaded by deploy.sh.
# Env vars expected:
#   ENV    - dev | qa | prod
#   IMAGE  - full TCR image with tag

set -euo pipefail

: "${ENV:?ENV must be set}"
: "${IMAGE:?IMAGE must be set}"

case "$ENV" in
  dev)
    CONTAINER="numind-web-v3-dev"
    PORTS="-p 9200:80"
    HEALTH_PORT=9200
    API_PROXY_PASS="http://numind-server-dev:9091/"
    ;;
  qa)
    CONTAINER="numind-web-v3-qa"
    PORTS="-p 9201:80"
    HEALTH_PORT=9201
    API_PROXY_PASS="http://numind-server-qa:9091/"
    ;;
  prod)
    CONTAINER="numind-web-v3"
    PORTS="-p 9202:80"
    HEALTH_PORT=9202
    API_PROXY_PASS="http://numind-server-prod:9091/"
    ;;
  *)
    echo "ERROR: ENV must be dev/qa/prod, got '$ENV'" >&2
    exit 1 ;;
esac

HEALTH_URL="http://localhost:${HEALTH_PORT}/health"
LOG_MAX_SIZE="10m"; LOG_MAX_FILE="3"
[ "$ENV" = "prod" ] && { LOG_MAX_SIZE="20m"; LOG_MAX_FILE="5"; }

echo "==============================================="
echo "Deploy: $CONTAINER"
echo "  Image           : $IMAGE"
echo "  Env             : $ENV"
echo "  API_PROXY_PASS  : $API_PROXY_PASS"
echo "  Health          : $HEALTH_URL"
echo "==============================================="

OLD_IMAGE=""
if [ "$ENV" = "prod" ]; then
  OLD_IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER" 2>/dev/null || echo "")
  [ -n "$OLD_IMAGE" ] && echo "Previous image (for rollback): $OLD_IMAGE"
fi

echo "Pulling image..."
docker pull "$IMAGE" \
  || { echo "Pull retry 1/2..."; sleep 10; docker pull "$IMAGE"; } \
  || { echo "Pull retry 2/2..."; sleep 20; docker pull "$IMAGE"; }
docker image prune -f >/dev/null 2>&1 || true

docker network create numind-network 2>/dev/null || true

start_container() {
  local img="$1"
  docker run -d \
    --name "$CONTAINER" \
    --network numind-network \
    $PORTS \
    -e "API_PROXY_PASS=${API_PROXY_PASS}" \
    --log-driver json-file \
    --log-opt "max-size=${LOG_MAX_SIZE}" \
    --log-opt "max-file=${LOG_MAX_FILE}" \
    --restart always \
    "$img"
}

docker stop "$CONTAINER" 2>/dev/null || true
docker rm "$CONTAINER" 2>/dev/null || true
start_container "$IMAGE"

MAX_TRIES=30; SLEEP_INT=2

echo "Waiting for health check (up to $((MAX_TRIES * SLEEP_INT))s)..."
READY=false
for i in $(seq 1 "$MAX_TRIES"); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    READY=true; break
  fi
  sleep "$SLEEP_INT"
done

if [ "$READY" = true ]; then
  echo "✅ Deploy success: $CONTAINER is healthy"
  docker ps -f "name=^${CONTAINER}\$" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  exit 0
fi

echo "❌ Health check timeout for $CONTAINER" >&2
docker logs --tail 50 "$CONTAINER" || true

if [ "$ENV" = "prod" ] && [ -n "$OLD_IMAGE" ]; then
  echo "🔄 Rolling back to $OLD_IMAGE..."
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm "$CONTAINER" 2>/dev/null || true
  start_container "$OLD_IMAGE"
  for i in $(seq 1 "$MAX_TRIES"); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      echo "⚠️  Rollback success: $OLD_IMAGE restored"
      exit 1
    fi
    sleep "$SLEEP_INT"
  done
  echo "❌ Rollback also failed" >&2
fi
exit 1
