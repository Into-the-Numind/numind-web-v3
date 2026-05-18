#!/usr/bin/env bash
# Orchestrator: runs on build server. SCPs deploy-remote.sh and runs it.
# Invocation: bash scripts/cicd/deploy.sh <env>

set -euo pipefail

ENV="${1:?usage: $0 <dev|qa|prod>}"
GIT_SHA="${GIT_SHA:-unknown}"
GIT_TAG="${GIT_TAG:-}"

REGISTRY="ccr.ccs.tencentyun.com"
NAMESPACE="youshunumind"
IMAGE_NAME="numind-web-v3"

case "$ENV" in
  dev)  ROLLING_TAG="develop" ;;
  qa)   ROLLING_TAG="release" ;;
  prod) ROLLING_TAG="${GIT_TAG:-latest}" ;;
  *) echo "ERROR: env must be dev/qa/prod" >&2; exit 1 ;;
esac

SHA_TAG="${ROLLING_TAG}-${GIT_SHA}"
FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${SHA_TAG}"

case "$ENV" in
  dev)  DEPLOY_HOST="49.233.219.254" ;;
  qa)   DEPLOY_HOST="49.233.219.254" ;;
  prod) DEPLOY_HOST="129.28.125.51"  ;;
esac

REMOTE_SCRIPT="/tmp/numind-web-v3-deploy-remote.sh"

echo "==============================================="
echo "Deploying $IMAGE_NAME -> $ENV ($DEPLOY_HOST)"
echo "Image: $FULL_IMAGE"
echo "==============================================="

scp -o StrictHostKeyChecking=no -q \
    "$(dirname "$0")/deploy-remote.sh" \
    "root@${DEPLOY_HOST}:${REMOTE_SCRIPT}"

ssh -o StrictHostKeyChecking=no "root@${DEPLOY_HOST}" \
    "ENV='${ENV}' IMAGE='${FULL_IMAGE}' bash ${REMOTE_SCRIPT}"
