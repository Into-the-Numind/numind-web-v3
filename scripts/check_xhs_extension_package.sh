#!/usr/bin/env bash
set -euo pipefail

# Checks that the XHS video-script extension source, packaged zip, and
# youshulab-web download zip are in sync and still target production.
#
# Env overrides:
#   STATIC_WEB_DIR=/path/to/youshulab-web
#   SOURCE_ZIP=/path/to/xhs-collector-extension.zip
#   STATIC_ZIP=/path/to/xhs-script-extension.zip
#   EXPECTED_XHS_MATCH='*://*.xiaohongshu.com/*'
#   EXPECTED_YOUSHU_MATCH='https://youshulab.com/*'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
STATIC_WEB_DIR="${STATIC_WEB_DIR:-${REPO_ROOT}/../../youshulab-web}"
SOURCE_ZIP="${SOURCE_ZIP:-${REPO_ROOT}/public/downloads/xhs-collector-extension.zip}"
STATIC_ZIP="${STATIC_ZIP:-${STATIC_WEB_DIR}/script/xhs-script-extension.zip}"
EXPECTED_XHS_MATCH="${EXPECTED_XHS_MATCH:-*://*.xiaohongshu.com/*}"
EXPECTED_YOUSHU_MATCH="${EXPECTED_YOUSHU_MATCH:-https://youshulab.com/*}"
EXPECTED_API_BASE="${EXPECTED_API_BASE:-https://youshulab.com/api}"
EXPECTED_NOTES_PATH="${EXPECTED_NOTES_PATH:-/v1/xhs-script/notes}"

failures=0
tmp_dir=""

pass() {
  printf 'ok - %s\n' "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  failures=$((failures + 1))
}

cleanup() {
  if [ -n "${tmp_dir}" ] && [ -d "${tmp_dir}" ]; then
    rm -rf "${tmp_dir}"
  fi
}
trap cleanup EXIT

require_tool() {
  local tool="$1"
  if command -v "${tool}" >/dev/null 2>&1; then
    pass "found ${tool}"
  else
    fail "missing required tool: ${tool}"
  fi
}

require_file() {
  local file="$1"
  local label="$2"
  if [ -f "${file}" ]; then
    pass "${label} exists"
  else
    fail "${label} is missing: ${file}"
  fi
}

contains() {
  local file="$1"
  local needle="$2"
  local label="$3"
  if grep -Fq "${needle}" "${file}"; then
    pass "${label}"
  else
    fail "${label}; missing ${needle} in ${file}"
  fi
}

absent_in_files() {
  local label="$1"
  shift
  local pattern="$1"
  shift
  local matches
  if matches="$(grep -En "${pattern}" "$@" 2>/dev/null)"; then
    fail "${label}: ${matches}"
  else
    pass "${label}"
  fi
}

hash_file() {
  local output
  output="$(shasum -a 256 "$1")"
  printf '%s\n' "${output%% *}"
}

compare_zip_entry_to_source() {
  local zip_file="$1"
  local entry="$2"
  local source_file="$3"
  local dest="${tmp_dir}/zip-entry/${entry}"

  mkdir -p "$(dirname "${dest}")"
  if ! unzip -p "${zip_file}" "${entry}" >"${dest}" 2>/dev/null; then
    fail "zip ${zip_file} is missing ${entry}"
    return
  fi

  if cmp -s "${source_file}" "${dest}"; then
    pass "zip entry ${entry} matches extension source"
  else
    fail "zip entry ${entry} differs from ${source_file}"
  fi
}

check_manifest() {
  local manifest_path="$1"
  local label="$2"

  if node - "${manifest_path}" "${EXPECTED_XHS_MATCH}" "${EXPECTED_YOUSHU_MATCH}" <<'NODE'
const fs = require('fs');

const [manifestPath, expectedXhsMatch, expectedYoushuMatch] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const arr = (value) => (Array.isArray(value) ? value : []);
const errors = [];

const hostPermissions = arr(manifest.host_permissions);
if (manifest.manifest_version !== 3) {
  errors.push('manifest_version must be 3');
}
if (!hostPermissions.includes(expectedXhsMatch)) {
  errors.push(`host_permissions missing ${expectedXhsMatch}`);
}
if (!hostPermissions.includes(expectedYoushuMatch)) {
  errors.push(`host_permissions missing ${expectedYoushuMatch}`);
}
if (hostPermissions.includes('<all_urls>')) {
  errors.push('host_permissions must not include <all_urls>');
}
if (hostPermissions.some((value) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(value))) {
  errors.push('host_permissions must not include local development origins');
}

const contentScripts = arr(manifest.content_scripts);
const xhsScript = contentScripts.find((script) => arr(script.matches).includes(expectedXhsMatch));
if (!xhsScript) {
  errors.push(`content_scripts missing ${expectedXhsMatch}`);
} else {
  const js = arr(xhsScript.js);
  for (const required of ['lib/parse.js', 'lib/script-payload.js', 'content.js']) {
    if (!js.includes(required)) {
      errors.push(`XHS content script missing ${required}`);
    }
  }
}

const webBridge = contentScripts.find((script) => arr(script.matches).includes(expectedYoushuMatch));
if (!webBridge || !arr(webBridge.js).includes('connect-bridge.js')) {
  errors.push('youshulab.com content script must load connect-bridge.js');
}

const externallyConnectable = arr(manifest.externally_connectable && manifest.externally_connectable.matches);
if (externallyConnectable.length !== 1 || externallyConnectable[0] !== expectedYoushuMatch) {
  errors.push('externally_connectable must be restricted to youshulab.com');
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
NODE
  then
    pass "${label} manifest is production-scoped"
  else
    fail "${label} manifest is not production-scoped"
  fi
}

require_tool node
require_tool unzip
require_tool shasum
require_tool cmp
require_tool grep

if [ "${failures}" -ne 0 ]; then
  exit 1
fi

if [ -d "${STATIC_WEB_DIR}" ]; then
  STATIC_WEB_DIR="$(cd "${STATIC_WEB_DIR}" && pwd -P)"
  STATIC_ZIP="${STATIC_ZIP:-${STATIC_WEB_DIR}/script/xhs-script-extension.zip}"
else
  fail "static web dir is missing: ${STATIC_WEB_DIR}"
fi

tmp_dir="$(mktemp -d)"

required_entries=(
  "manifest.json"
  "content.js"
  "background.js"
  "connect-bridge.js"
  "popup.html"
  "popup.js"
  "popup.css"
  "lib/script-payload.js"
  "lib/parse.js"
)

source_files=()
for entry in "${required_entries[@]}"; do
  source_file="${REPO_ROOT}/extension/${entry}"
  require_file "${source_file}" "extension/${entry}"
  source_files+=("${source_file}")
done

require_file "${SOURCE_ZIP}" "source extension zip"
require_file "${STATIC_ZIP}" "static-site extension zip"

if [ "${failures}" -ne 0 ]; then
  exit 1
fi

check_manifest "${REPO_ROOT}/extension/manifest.json" "source"
contains "${REPO_ROOT}/extension/background.js" "${EXPECTED_API_BASE}" "background targets production API base"
contains "${REPO_ROOT}/extension/background.js" "${EXPECTED_NOTES_PATH}" "background targets XHS notes endpoint"
contains "${REPO_ROOT}/extension/content.js" "extractInitialStateFromHtmlText" "content reads XHS initial state"
contains "${REPO_ROOT}/extension/content.js" "extractVideoUrlFromState" "content prefers state video URL"
contains "${REPO_ROOT}/extension/content.js" "validateForScriptUpload" "content enforces upload gate"
contains "${REPO_ROOT}/extension/lib/script-payload.js" "note_type !== 'video'" "payload rejects non-video notes"
contains "${REPO_ROOT}/extension/lib/script-payload.js" "video_url" "payload requires a video URL"
absent_in_files "production extension files contain no local dev origins" 'localhost|127\.0\.0\.1|0\.0\.0\.0' "${source_files[@]}"

for entry in "${required_entries[@]}"; do
  compare_zip_entry_to_source "${SOURCE_ZIP}" "${entry}" "${REPO_ROOT}/extension/${entry}"
done

if unzip -p "${SOURCE_ZIP}" manifest.json >"${tmp_dir}/packaged-manifest.json" 2>/dev/null; then
  check_manifest "${tmp_dir}/packaged-manifest.json" "packaged"
else
  fail "packaged manifest.json could not be extracted from ${SOURCE_ZIP}"
fi

source_hash="$(hash_file "${SOURCE_ZIP}")"
static_hash="$(hash_file "${STATIC_ZIP}")"
if [ "${source_hash}" = "${static_hash}" ]; then
  pass "static-site zip matches source zip (${source_hash})"
else
  fail "static-site zip hash ${static_hash} differs from source zip ${source_hash}"
fi

if [ "${failures}" -ne 0 ]; then
  printf '\nXHS extension package check failed with %s issue(s).\n' "${failures}" >&2
  exit 1
fi

printf '\nXHS extension package check passed.\n'
