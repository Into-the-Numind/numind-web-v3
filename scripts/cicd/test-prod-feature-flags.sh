#!/usr/bin/env bash
# Regression test for product feature flags compiled into the Prod web image.
#
# Product decision:
#   - notification center: ON in prod
#   - document system: ON in prod
#   - meeting copilot: OFF in prod
#   - meeting diarization: OFF in prod
#
# The real build-and-push.sh is executed end-to-end with fake docker/grep
# binaries, so this checks the exact --build-arg values without building or
# pushing an image.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_AND_PUSH="$SCRIPT_DIR/build-and-push.sh"

die() { echo "test setup error: $1" >&2; exit 2; }

TEST_TMP="$(mktemp -d)" || die "mktemp"
trap 'rm -rf "$TEST_TMP"' EXIT

mkdir -p "$TEST_TMP/bin" || die "mkdir bin"

cat > "$TEST_TMP/bin/docker" <<'DOCKER' || die "write fake docker"
#!/usr/bin/env bash
case "${1:-}" in
  build)
    shift
    printf '%s\n' "$@" > "${FAKE_DOCKER_BUILD_ARGS:?}"
    exit 0
    ;;
  push)
    echo "${2:-image}: digest: sha256:test size: 1"
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
DOCKER
chmod +x "$TEST_TMP/bin/docker" || die "chmod docker"

cat > "$TEST_TMP/bin/grep" <<'GREP' || die "write fake grep"
#!/usr/bin/env bash
for arg in "$@"; do
  case "$arg" in
    */.docker/config.json) exit 0 ;;
  esac
done
exec /usr/bin/grep "$@"
GREP
chmod +x "$TEST_TMP/bin/grep" || die "chmod grep"

assert_arg() {
  local expected="$1"
  if /usr/bin/grep -Fxq -- "$expected" "$FAKE_DOCKER_BUILD_ARGS"; then
    echo "PASS: $expected"
  else
    echo "FAIL: missing build arg '$expected'" >&2
    return 1
  fi
}

FAKE_DOCKER_BUILD_ARGS="$TEST_TMP/prod-build-args"
export FAKE_DOCKER_BUILD_ARGS

(
  cd "$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)" || exit 2
  PATH="$TEST_TMP/bin:$PATH" \
    GIT_SHA="testsha" \
    GIT_TAG="v-test" \
    bash "$BUILD_AND_PUSH" prod
) > "$TEST_TMP/prod-output" 2>&1 || {
  cat "$TEST_TMP/prod-output" >&2
  die "prod build script failed"
}

fail=0
assert_arg "VITE_ENABLE_NOTIFICATIONS=true" || fail=1
assert_arg "VITE_ENABLE_DOCUMENT_SYSTEM=true" || fail=1
assert_arg "VITE_ENABLE_MEETING_COPILOT=" || fail=1
assert_arg "VITE_ENABLE_MEETING_DIARIZATION=" || fail=1

if [ "$fail" -ne 0 ]; then
  echo "❌ prod feature-flag test FAILED"
  exit 1
fi

echo "✅ prod feature-flag test PASSED"
