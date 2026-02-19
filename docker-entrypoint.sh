#!/bin/sh
set -eu

# 按环境注入 API 反向代理上游地址
API_PROXY_PASS="${API_PROXY_PASS:-https://youshu.asia/dev/}"
case "$API_PROXY_PASS" in
  */) ;;
  *) API_PROXY_PASS="${API_PROXY_PASS}/" ;;
esac
export API_PROXY_PASS

if [ -f /etc/nginx/templates/default.conf.template ]; then
  envsubst '${API_PROXY_PASS}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf
fi

exec "$@"
