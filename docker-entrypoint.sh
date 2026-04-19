#!/bin/sh
set -eu

# 按环境注入 API 反向代理上游地址
# 注意：/dev 路径返回旧版前端 HTML，不是 API JSON
API_PROXY_PASS="${API_PROXY_PASS:-https://youshu.asia/}"
case "$API_PROXY_PASS" in
  */) ;;
  *) API_PROXY_PASS="${API_PROXY_PASS}/" ;;
esac

# 无尾斜杠版本，给 nginx 变量形式的 proxy_pass 使用（配合 rewrite 剥 location 前缀）。
# nginx 含变量的 proxy_pass URL 若带尾 "/" 会只发根路径，丢失请求 path。
API_PROXY_UPSTREAM="${API_PROXY_PASS%/}"

export API_PROXY_PASS API_PROXY_UPSTREAM

if [ -f /etc/nginx/templates/default.conf.template ]; then
  envsubst '${API_PROXY_PASS} ${API_PROXY_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/conf.d/default.conf
fi

exec "$@"
