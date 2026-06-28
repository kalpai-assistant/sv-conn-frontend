#!/usr/bin/env bash
# Native-build prerequisite check (SC-68).
#
# Reports what's installed vs. what's missing so a fresh dev can fix
# everything in one pass instead of discovering missing tools one error at
# a time during the build.
#
# Exit code:
#   0 — web build works (Node + npm present)
#   1 — web build can't run (missing Node or npm)
# Non-fatal warnings (Java / Android SDK / Xcode / CocoaPods missing) print
# a hint but don't fail the script — useful in CI environments that only
# care about the web build.

set -u

# $'...' bash quoting interprets the escape sequences at variable-set time,
# so the printf format strings render colours instead of literal "\033[...m".
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
RED=$'\033[0;31m'
RESET=$'\033[0m'

ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
fail()  { printf '  %s✗%s %s\n' "$RED" "$RESET" "$1"; }

# macOS ships shim binaries at /usr/bin/java and /usr/bin/xcodebuild that
# *exist* even when the real tool isn't installed — they just print an error
# to stderr and return non-zero. `command -v` alone is misleading. probe()
# actually runs the version flag and checks it succeeded.
probe() {
  local cmd="$1"
  local flag="$2"
  command -v "$cmd" >/dev/null 2>&1 && "$cmd" $flag >/dev/null 2>&1
}

echo "ServiceConnect — native build doctor"
echo

# --- Required: Node + npm (web build can't happen without these) -----------

fatal_missing=0
echo "Web build:"

if probe node -v; then
  node_v=$(node -v)
  node_major=$(printf '%s' "$node_v" | sed -E 's/^v([0-9]+).*/\1/')
  if [ "$node_major" -ge 22 ]; then
    ok "Node $node_v"
  else
    warn "Node $node_v (recommended: 22 LTS)"
  fi
else
  fail "Node is not installed — install via nvm or https://nodejs.org"
  fatal_missing=1
fi

if probe npm -v; then
  ok "npm $(npm -v)"
else
  fail "npm is not installed — bundled with Node"
  fatal_missing=1
fi

if command -v bun >/dev/null 2>&1; then
  warn "bun is installed — we use npm. Either is fine if npm scripts still work."
fi

echo

# --- Android prereqs ------------------------------------------------------

echo "Android build (optional):"

if probe java -version; then
  java_v=$(java -version 2>&1 | head -1)
  ok "$java_v"
else
  warn "Java is not installed — Gradle 8.14.3 needs JDK 17+. Install: brew install --cask temurin@17"
fi

if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ]; then
  ok "ANDROID_HOME=$ANDROID_HOME"
elif [ -n "${ANDROID_SDK_ROOT:-}" ] && [ -d "$ANDROID_SDK_ROOT" ]; then
  ok "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
else
  warn "Neither ANDROID_HOME nor ANDROID_SDK_ROOT is set — install Android Studio + run SDK Manager"
fi

if probe adb version; then
  ok "adb available — physical-device install possible"
else
  warn "adb not on PATH — install Android Studio platform-tools"
fi

echo

# --- iOS prereqs ----------------------------------------------------------

echo "iOS build (optional, macOS only):"

if [ "$(uname -s)" = "Darwin" ]; then
  # xcode-select -p succeeds for both real Xcode and the standalone CLT.
  # xcodebuild only succeeds with a real Xcode install — separate check.
  if xcode-select -p >/dev/null 2>&1; then
    ok "Xcode command-line tools: $(xcode-select -p)"
  else
    warn "Xcode command-line tools missing — xcode-select --install"
  fi

  if probe xcodebuild -version; then
    ok "$(xcodebuild -version 2>/dev/null | head -1)"
  else
    warn "xcodebuild not usable — install full Xcode from the Mac App Store (CLT alone is not enough)"
  fi

  if probe pod --version; then
    ok "CocoaPods $(pod --version)"
  else
    warn "CocoaPods missing — brew install cocoapods"
  fi
else
  warn "Not on macOS — iOS builds are macOS-only. Skipping."
fi

echo

if [ "$fatal_missing" -ne 0 ]; then
  printf '%sWeb build prereqs missing. Fix above and re-run.%s\n' "$RED" "$RESET"
  exit 1
fi

printf '%sWeb build prereqs OK.%s Native warnings (if any) only block their respective platform.\n' "$GREEN" "$RESET"
