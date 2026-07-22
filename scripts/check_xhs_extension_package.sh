#!/usr/bin/env bash
set -euo pipefail

# Checks that the original XHS collector extension is still the workbench
# collector package, not the standalone /script/ video-script plugin.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
EXTENSION_SOURCE_DIR="${EXTENSION_SOURCE_DIR:-${REPO_ROOT}/extension}"
PACKAGE_ZIP="${PACKAGE_ZIP:-${REPO_ROOT}/public/downloads/xhs-collector-extension.zip}"
EXPECTED_NOTES_PATH="${EXPECTED_NOTES_PATH:-/v1/xhs/notes}"

failures=0

pass() {
  printf 'ok - %s\n' "$1"
}

fail() {
  printf 'not ok - %s\n' "$1" >&2
  failures=$((failures + 1))
}

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
  if [[ -f "${file}" ]]; then
    pass "${label} exists"
  else
    fail "${label} is missing: ${file}"
  fi
}

require_missing() {
  local path="$1"
  local label="$2"
  if [[ ! -e "${path}" ]]; then
    pass "${label} is absent"
  else
    fail "${label} should not exist in collector extension: ${path}"
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

zip_contains() {
  local entry="$1"
  local needle="$2"
  local label="$3"
  if unzip -p "${PACKAGE_ZIP}" "${entry}" 2>/dev/null | grep -Fq "${needle}"; then
    pass "${label}"
  else
    fail "${label}; missing ${needle} in zip entry ${entry}"
  fi
}

zip_absent() {
  local entry="$1"
  local pattern="$2"
  local label="$3"
  local matches
  if matches="$(unzip -p "${PACKAGE_ZIP}" "${entry}" 2>/dev/null | grep -En "${pattern}" || true)" && [[ -n "${matches}" ]]; then
    fail "${label}: ${matches}"
  else
    pass "${label}"
  fi
}

require_tool unzip
require_tool grep

required_entries=(
  "manifest.json"
  "page-state-bridge.js"
  "content.js"
  "background.js"
  "connect-bridge.js"
  "popup.html"
  "popup.js"
  "popup.css"
  "lib/parse.js"
)

source_files=()
for entry in "${required_entries[@]}"; do
  source_file="${EXTENSION_SOURCE_DIR}/${entry}"
  require_file "${source_file}" "extension/${entry}"
  source_files+=("${source_file}")
done

require_file "${PACKAGE_ZIP}" "collector extension zip"
require_missing "${EXTENSION_SOURCE_DIR}/lib/script-payload.js" "script upload gate"

if [[ "${failures}" -ne 0 ]]; then
  exit 1
fi

contains "${EXTENSION_SOURCE_DIR}/manifest.json" '"name": "有数选题采集"' "source manifest keeps collector name"
contains "${EXTENSION_SOURCE_DIR}/background.js" "${EXPECTED_NOTES_PATH}" "source background targets collector notes endpoint"
contains "${EXTENSION_SOURCE_DIR}/background.js" "const TOKEN_KEY = 'youshu_ext_token'" "source background uses collector token key"
contains "${EXTENSION_SOURCE_DIR}/connect-bridge.js" "NUMIND_XHS_EXT_TOKEN" "source bridge accepts collector auth token message"
contains "${EXTENSION_SOURCE_DIR}/manifest.json" '"http://49.233.219.254/*"' "source manifest allows dev web origin"
contains "${EXTENSION_SOURCE_DIR}/background.js" "http://49.233.219.254:9200" "source background can target dev API origin"
contains "${EXTENSION_SOURCE_DIR}/content.js" "YOUSHU_XHS_READ_PAGE_STATE_REQUEST" "source content asks MAIN world bridge for runtime state"
contains "${EXTENSION_SOURCE_DIR}/lib/parse.js" "extractVideoUrlFromResourceEntries" "source parser can use performance video resources"
contains "${EXTENSION_SOURCE_DIR}/lib/parse.js" "extractVideoUrlFromDom" "source parser can use DOM video fallback"
contains "${EXTENSION_SOURCE_DIR}/popup.js" "有数选题库" "source popup points users to the topic library"
absent_in_files "collector source contains no script-plugin markers" 'xhs-script|口播稿|youshu_xhs_script|script-payload|youshulab\.com/script' "${source_files[@]}"
absent_in_files "collector source contains no unreplaced placeholders" 'YOUSHU_(WEB|API)_DOMAIN_PLACEHOLDER|PLACEHOLDER_EXTENSION_ID' "${source_files[@]}"

for entry in "${required_entries[@]}"; do
  if unzip -p "${PACKAGE_ZIP}" "${entry}" >/dev/null 2>&1; then
    pass "zip contains ${entry}"
  else
    fail "zip is missing ${entry}"
  fi
done

zip_contains "manifest.json" '"name": "有数选题采集"' "packaged manifest keeps collector name"
zip_contains "background.js" "${EXPECTED_NOTES_PATH}" "packaged background targets collector notes endpoint"
zip_contains "background.js" "const TOKEN_KEY = 'youshu_ext_token'" "packaged background uses collector token key"
zip_contains "connect-bridge.js" "NUMIND_XHS_EXT_TOKEN" "packaged bridge accepts collector auth token message"
zip_contains "manifest.json" '"http://49.233.219.254/*"' "packaged manifest allows dev web origin"
zip_contains "background.js" "http://49.233.219.254:9200" "packaged background can target dev API origin"
zip_contains "page-state-bridge.js" "YOUSHU_XHS_READ_PAGE_STATE_REQUEST" "packaged bridge can read runtime state"
zip_contains "lib/parse.js" "extractVideoUrlFromResourceEntries" "packaged parser can use performance video resources"
zip_absent "manifest.json" 'xhs-script|口播稿|youshulab\.com' "packaged manifest contains no script-plugin markers"
zip_absent "background.js" 'xhs-script|youshu_xhs_script|YOUSHU_SCRIPT|youshulab\.com/script' "packaged background contains no script-plugin markers"
zip_absent "manifest.json" 'YOUSHU_(WEB|API)_DOMAIN_PLACEHOLDER|PLACEHOLDER_EXTENSION_ID' "packaged manifest contains no unreplaced placeholders"
zip_absent "background.js" 'YOUSHU_(WEB|API)_DOMAIN_PLACEHOLDER|PLACEHOLDER_EXTENSION_ID' "packaged background contains no unreplaced placeholders"

if [[ "${failures}" -ne 0 ]]; then
  printf '\nXHS collector extension package check failed with %s issue(s).\n' "${failures}" >&2
  exit 1
fi

printf '\nXHS collector extension package check passed.\n'
