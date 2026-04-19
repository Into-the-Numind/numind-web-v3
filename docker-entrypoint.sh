#!/bin/sh
set -eu

# 按环境注入 API 反向代理上游地址
# 注意：/dev 路径返回旧版前端 HTML，不是 API JSON
#
# DNS 依赖：nginx 配置使用 `resolver 127.0.0.11`（Docker 内置 DNS）做动态解析。
# 本镜像要求运行在 Docker 默认 bridge 网络或 user-defined bridge 上。
# 如果用 --network=host 或 --network=none 运行，127.0.0.11 不可达，
# 每个请求会 resolver timeout → 502。docker-compose/CI 默认满足，手工 docker run 注意。
API_PROXY_PASS="${API_PROXY_PASS:-https://youshu.asia/}"
case "$API_PROXY_PASS" in
  */) ;;
  *) API_PROXY_PASS="${API_PROXY_PASS}/" ;;
esac

# 无尾斜杠版本，给 nginx 变量形式的 proxy_pass 使用（配合 rewrite 剥 location 前缀）。
# nginx 含变量的 proxy_pass URL 若带尾 "/" 会只发根路径，丢失请求 path。
API_PROXY_UPSTREAM="${API_PROXY_PASS%/}"

export API_PROXY_PASS API_PROXY_UPSTREAM

# Boot 诊断日志：打印生效的 upstream，方便 502 事故时快速确认配置来源。
echo "[boot] API_PROXY_PASS=$API_PROXY_PASS" >&2
echo "[boot] API_PROXY_UPSTREAM=$API_PROXY_UPSTREAM" >&2

if [ -f /etc/nginx/templates/default.conf.template ]; then
  envsubst '${API_PROXY_PASS} ${API_PROXY_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf
fi

exec "$@"
