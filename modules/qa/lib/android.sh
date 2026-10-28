# qa android: Maestro flows on an emulator. Reuses an already-connected device (and leaves it
# running); otherwise boots the AVD headless and shuts it down on exit. Needs adb, emulator and
# maestro on PATH (`nix develop ~/.dotfiles#android`).

QA_DIR=".qa"
QA_ADB_SESSION="$QA_DIR/android-session"

qa_android_usage() {
  cat >&2 <<'EOF'
usage: qa android run  --apk <path> [--build "<cmd>"] [--flows <dir>] [--avd <name>]
       qa android up   [--avd <name>]          boot (or reuse) a device for exploring
       qa android down                         stop a device that `up` booted
       qa android hierarchy | screenshot       inspect the current screen (text UI tree / png)
flows: .maestro/*.yaml by default; --avd defaults to the first `emulator -list-avds`.
EOF
  exit 64
}

# Re-exec inside the android devshell when its tools are missing (once; QA_DEVSHELL guards loops).
qa_android_need() {
  for tool in adb emulator maestro; do
    command -v "$tool" >/dev/null && continue
    [ -z "${QA_DEVSHELL:-}" ] || { echo "qa: $tool missing even inside the android devshell" >&2; exit 1; }
    QA_DEVSHELL=1 exec nix develop "$HOME/.dotfiles#android" -c "$QA_SELF" android "$@"
  done
}

# The android devshell exports JAVA_HOME (Android Studio JBR, Java 25) for Gradle; Maestro 2.11
# fails to install its driver under it, so run Maestro on the JDK 21 its Nix wrapper provides.
qa_maestro() { env -u JAVA_HOME maestro --device "$SERIAL" "$@"; }

qa_android_wait_boot() {
  i=0
  until [ "$(adb -s "$1" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    if [ -n "${EMU_PID:-}" ] && ! kill -0 "$EMU_PID" 2>/dev/null; then
      echo "qa: emulator exited during boot:" >&2; tail -5 "$QA_DIR/out/emulator.log" >&2; return 1
    fi
    i=$((i + 1))
    [ "$i" -lt 180 ] || { echo "qa: $1 did not finish booting in 180s" >&2; return 1; }
    sleep 1
  done
}

qa_android_up() {
  mkdir -p "$QA_DIR/out"
  serial=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
  if [ -n "$serial" ]; then
    printf 'SERIAL=%s\nEMU_PID=\n' "$serial" >"$QA_ADB_SESSION"
    echo "qa: reusing connected device $serial"; return 0
  fi
  [ -n "$avd" ] || avd=$(emulator -list-avds | head -1)
  [ -n "$avd" ] || { echo "qa: no AVD found (create one in Android Studio)" >&2; exit 1; }
  before=$(adb devices | awk 'NR > 1 { print $1 }')
  perl -e 'setpgrp; exec @ARGV' emulator -avd "$avd" -no-window -no-audio -no-boot-anim \
    -no-snapshot-save >"$QA_DIR/out/emulator.log" 2>&1 &
  EMU_PID=$!
  i=0
  while :; do
    serial=$(adb devices | awk 'NR > 1 { print $1 }' | grep -vxF "$before" | head -1 || true)
    [ -z "$serial" ] || break
    i=$((i + 1))
    [ "$i" -lt 60 ] && kill -0 "$EMU_PID" 2>/dev/null || { echo "qa: emulator never appeared in adb" >&2; kill -- "-$EMU_PID" 2>/dev/null; exit 1; }
    sleep 1
  done
  printf 'SERIAL=%s\nEMU_PID=%s\n' "$serial" "$EMU_PID" >"$QA_ADB_SESSION"
  qa_android_wait_boot "$serial" || { qa_android_down; exit 1; }
  echo "qa: $avd booted as $serial"
}

qa_android_down() {
  [ -f "$QA_ADB_SESSION" ] || return 0
  . "./$QA_ADB_SESSION"
  if [ -n "${EMU_PID:-}" ]; then
    adb -s "$SERIAL" emu kill >/dev/null 2>&1 || true
    i=0
    while kill -0 "$EMU_PID" 2>/dev/null && [ "$i" -lt 20 ]; do sleep 1; i=$((i + 1)); done
    kill -- "-$EMU_PID" 2>/dev/null || true
  fi
  rm -f "$QA_ADB_SESSION"
}

qa_android_run() {
  [ -n "$apk" ] || qa_android_usage
  if [ -n "$build" ]; then sh -c "$build" || { echo "qa: build failed: $build" >&2; exit 1; }; fi
  [ -f "$apk" ] || { echo "qa: apk not found: $apk" >&2; exit 1; }
  qa_android_up
  trap qa_android_down EXIT INT TERM
  . "./$QA_ADB_SESSION"
  adb -s "$SERIAL" install -r "$apk" >"$QA_DIR/out/install.log" 2>&1 || { echo "qa: install failed (see $QA_DIR/out/install.log)" >&2; exit 1; }
  if qa_maestro test --format junit --output "$QA_DIR/out/android-junit.xml" \
    --test-output-dir "$QA_DIR/out/android" "$flows"; then
    echo "qa android: all flows passed"
  else
    echo "qa android: FAILED — evidence: $QA_DIR/out/android/ (screenshots, logs), $QA_DIR/out/android-junit.xml"
    return 1
  fi
}

qa_android_inspect() {
  [ -f "$QA_ADB_SESSION" ] || { echo "qa: no device session; run 'qa android up' first" >&2; exit 1; }
  . "./$QA_ADB_SESSION"
  case "$1" in
    hierarchy) qa_maestro hierarchy ;;
    screenshot) mkdir -p "$QA_DIR/out"; adb -s "$SERIAL" exec-out screencap -p >"$QA_DIR/out/screen.png"
      echo "$QA_DIR/out/screen.png" ;;
  esac
}

qa_android() {
  cmd="${1:-}"; [ -n "$cmd" ] || qa_android_usage
  case "$cmd" in run | up | hierarchy | screenshot) qa_android_need "$@" ;; esac
  shift
  apk="" build="" flows=".maestro" avd=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --apk) apk="$2"; shift 2 ;;
      --build) build="$2"; shift 2 ;;
      --flows) flows="$2"; shift 2 ;;
      --avd) avd="$2"; shift 2 ;;
      *) qa_android_usage ;;
    esac
  done
  case "$cmd" in
    # A run keeps its own session file: reusing an `up` device must not take over (and then
    # delete) that session, which would orphan the emulator `up` started.
    run) QA_ADB_SESSION="$QA_DIR/android-session.run.$$"; qa_android_run ;;
    up) qa_android_up ;;
    down) qa_android_down ;;
    hierarchy | screenshot) qa_android_inspect "$cmd" ;;
    *) qa_android_usage ;;
  esac
}
