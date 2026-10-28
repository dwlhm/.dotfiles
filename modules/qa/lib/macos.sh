# qa macos: XCUITest UI tests for a macOS app via xcodebuild (ad-hoc signed, no Apple account).
# Regenerates an xcodegen project when project.yml exists; re-execs inside the project's own
# devshell (flake.nix) when its tools are missing. Evidence: .qa/out/macos.xcresult + exported
# attachments (screenshots) on failure.

QA_DIR=".qa"

qa_macos_usage() {
  cat >&2 <<'EOF'
usage: qa macos run --scheme <scheme> --only <UITestTarget> [-- <extra xcodebuild args>]
       qa macos screenshot                 capture the screen to .qa/out/screen.png
First run: macOS asks to allow the UI test runner under Privacy & Security → Accessibility
(and Automation); approve once, then re-run.
EOF
  exit 64
}

qa_macos_need() {
  command -v xcodebuild >/dev/null || { echo "qa: xcodebuild not found (install Xcode)" >&2; exit 1; }
  [ -f project.yml ] || return 0
  command -v xcodegen >/dev/null && return 0
  [ -z "${QA_DEVSHELL:-}" ] && [ -f flake.nix ] || { echo "qa: xcodegen not found for project.yml" >&2; exit 1; }
  QA_DEVSHELL=1 exec nix develop -c "$QA_SELF" macos "$@"
}

qa_macos_report() {
  result="$QA_DIR/out/macos.xcresult"
  [ -d "$result" ] || return 0
  xcrun xcresulttool get test-results summary --path "$result" 2>/dev/null |
    jq -r '"tests: \(.passedTests // 0) passed, \(.failedTests // 0) failed",
      (.testFailures[]? | "FAIL \(.testName): \(.failureText)")' || true
  if [ "$1" != 0 ]; then
    rm -rf "$QA_DIR/out/macos-attachments"
    xcrun xcresulttool export attachments --path "$result" \
      --output-path "$QA_DIR/out/macos-attachments" >/dev/null 2>&1 || true
    echo "qa macos: FAILED — evidence: $result, $QA_DIR/out/macos-attachments/"
  fi
}

qa_macos_run() {
  [ -n "$scheme" ] && [ -n "$only" ] || qa_macos_usage
  mkdir -p "$QA_DIR/out"
  [ ! -f project.yml ] || xcodegen generate --quiet
  rm -rf "$QA_DIR/out/macos.xcresult"
  beautify=cat
  command -v xcbeautify >/dev/null && beautify=xcbeautify
  { xcodebuild -scheme "$scheme" -destination 'platform=macOS' -only-testing:"$only" \
      -resultBundlePath "$QA_DIR/out/macos.xcresult" \
      CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= "$@" test 2>&1
    echo $? >"$QA_DIR/out/macos.rc"; } | "$beautify"
  rc=$(cat "$QA_DIR/out/macos.rc")
  # xcodebuild can exit 0 with failing tests: the xcresult summary is the verdict.
  failed=$(xcrun xcresulttool get test-results summary --path "$QA_DIR/out/macos.xcresult" 2>/dev/null |
    jq -r '.failedTests // empty')
  [ "$rc" != 0 ] || [ "${failed:-x}" = 0 ] || rc=1
  qa_macos_report "$rc"
  [ "$rc" = 0 ] && echo "qa macos: all UI tests passed"
  return "$rc"
}

qa_macos() {
  cmd="${1:-}"; [ -n "$cmd" ] || qa_macos_usage
  [ "$cmd" != run ] || qa_macos_need "$@"
  shift
  scheme="" only=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --scheme) scheme="$2"; shift 2 ;;
      --only) only="$2"; shift 2 ;;
      --) shift; break ;;
      *) qa_macos_usage ;;
    esac
  done
  case "$cmd" in
    run) qa_macos_run "$@" ;;
    screenshot) mkdir -p "$QA_DIR/out"; screencapture -x "$QA_DIR/out/screen.png"; echo "$QA_DIR/out/screen.png" ;;
    *) qa_macos_usage ;;
  esac
}
