#!/bin/sh
set -eu

# 按环境注入 API 反向代理上游地址
API_PROXY_PASS="${API_PROXY_PASS:-http://host.docker.internal:9091/}"
case "$API_PROXY_PASS" in
  */) ;;
  *) API_PROXY_PASS="${API_PROXY_PASS}/" ;;
esac
export API_PROXY_PASS

envsubst '${API_PROXY_PASS}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec "$@"
