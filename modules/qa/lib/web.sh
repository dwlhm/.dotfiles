# qa web: anoa (headless, ephemeral) against a local app. Network is sandboxed: every request
# goes to a dead proxy except loopback, so flows and exploring agents can only reach the app.
# Session state lives in .qa/session (cwd = project root) so `qa browse` can reach the browser.

QA_DIR=".qa"
QA_SESSION="$QA_DIR/session"

qa_web_usage() {
  cat >&2 <<'EOF'
usage: qa web run  --url <url> [--serve "<cmd>"] [--flows <dir>]   up → every flow → down
       qa web up   --url <url> [--serve "<cmd>"]                   start a session for exploring
       qa web down                                                 stop the session
flows: .qa/web/*.anoa (anoa exec batches); $QA_URL in a flow expands to --url.
EOF
  exit 64
}

qa_free_port() {
  port=9400
  while nc -z 127.0.0.1 "$port" 2>/dev/null || nc -z 127.0.0.1 $((port + 2)) 2>/dev/null; do
    port=$((port + 3))
    [ "$port" -lt 9600 ] || { echo "qa: no free anoa port in 9400-9600" >&2; exit 1; }
  done
  echo "$port"
}

qa_wait_url() {
  i=0
  until curl -s -o /dev/null --max-time 2 "$1"; do
    if [ -n "$serve_pid" ] && ! kill -0 "$serve_pid" 2>/dev/null; then
      echo "qa: dev server exited before $1 was reachable:" >&2
      tail -5 "$QA_DIR/out/serve.log" >&2
      return 1
    fi
    i=$((i + 1))
    [ "$i" -lt 60 ] || { echo "qa: $1 not reachable after 60s" >&2; return 1; }
    sleep 1
  done
}

qa_web_up() {
  [ ! -f "$QA_SESSION" ] || { echo "qa: session already running ($QA_SESSION); run 'qa web down'" >&2; exit 1; }
  mkdir -p "$QA_DIR/out"
  serve_pid=""
  if [ -n "$serve" ]; then
    # Own process group so teardown also stops the dev server's children.
    perl -e 'setpgrp; exec @ARGV' sh -c "$serve" >"$QA_DIR/out/serve.log" 2>&1 &
    serve_pid=$!
  fi
  printf 'SERVE_PID=%s\nURL=%s\n' "$serve_pid" "$url" >"$QA_SESSION"
  qa_wait_url "$url" || { qa_web_down; exit 1; }
  port=$(qa_free_port)
  anoa --headless --ephemeral --port "$port" --proxy http://127.0.0.1:9 \
    --proxy-bypass "localhost;127.0.0.1;[::1]" >"$QA_DIR/out/anoa.log" 2>&1 &
  printf 'ANOA_PID=%s\nPORT=%s\n' "$!" "$port" >>"$QA_SESSION"
  i=0
  until anoa --port "$port" status >/dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -lt 30 ] || { echo "qa: anoa did not start (see $QA_DIR/out/anoa.log)" >&2; qa_web_down; exit 1; }
    sleep 1
  done
  echo "qa: session up — url $url, browser port $port (use: qa browse <verb> …)"
}

qa_web_down() {
  [ -f "$QA_SESSION" ] || return 0
  . "./$QA_SESSION"
  if [ -n "${PORT:-}" ]; then anoa --port "$PORT" close >/dev/null 2>&1 || true; fi
  # anoa acknowledges close before it exits; wait for the process we started.
  if [ -n "${ANOA_PID:-}" ]; then
    i=0
    while kill -0 "$ANOA_PID" 2>/dev/null && [ "$i" -lt 10 ]; do sleep 1; i=$((i + 1)); done
    kill "$ANOA_PID" 2>/dev/null || true
  fi
  if [ -n "${SERVE_PID:-}" ]; then kill -- "-$SERVE_PID" 2>/dev/null || true; fi
  rm -f "$QA_SESSION"
}

# Fails when the page logged console errors or uncaught exceptions.
qa_page_clean() {
  out="$QA_DIR/out/$1"
  anoa --port "$PORT" errors >"$out.errors.txt" 2>&1 || true
  anoa --port "$PORT" console --level error >"$out.console.txt" 2>&1 || true
  grep -q '^nothing recorded' "$out.errors.txt" && grep -q '^nothing recorded' "$out.console.txt"
}

qa_web_run() {
  qa_web_up
  trap qa_web_down EXIT INT TERM
  . "./$QA_SESSION"
  set -- "$flows"/*.anoa
  [ -e "$1" ] || { echo "qa: no flows in $flows/*.anoa" >&2; exit 1; }
  failed=0
  for flow in "$@"; do
    name=$(basename "$flow" .anoa)
    sed "s|\$QA_URL|$URL|g" "$flow" >"$QA_DIR/out/$name.anoa"
    if anoa --port "$PORT" exec "$QA_DIR/out/$name.anoa" >"$QA_DIR/out/$name.log" 2>&1 && qa_page_clean "$name"; then
      echo "PASS $name"
    else
      failed=$((failed + 1))
      anoa --port "$PORT" screenshot "$QA_DIR/out/$name.png" >/dev/null 2>&1 || true
      echo "FAIL $name — evidence: $QA_DIR/out/$name.{log,errors.txt,console.txt,png}"
      tail -3 "$QA_DIR/out/$name.log" | sed 's/^/     /'
    fi
  done
  echo "qa web: $(($# - failed))/$# flows passed"
  [ "$failed" -eq 0 ]
}

qa_web() {
  cmd="${1:-}"; [ -n "$cmd" ] || qa_web_usage; shift
  url="" serve="" flows="$QA_DIR/web"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --url) url="$2"; shift 2 ;;
      --serve) serve="$2"; shift 2 ;;
      --flows) flows="$2"; shift 2 ;;
      *) qa_web_usage ;;
    esac
  done
  case "$cmd" in
    # A run keeps its own session file so it never collides with an exploring session or
    # another concurrent run in the same project.
    run) [ -n "$url" ] || qa_web_usage; QA_SESSION="$QA_DIR/session.run.$$"; qa_web_run ;;
    up) [ -n "$url" ] || qa_web_usage; qa_web_up ;;
    down) qa_web_down ;;
    *) qa_web_usage ;;
  esac
}

# Exploring agents only get page-level verbs on the sandboxed session browser; never launch
# flags, `close`, `tab new --profile`, or anything that could start an unsandboxed browser.
qa_browse() {
  [ -f "$QA_SESSION" ] || { echo "qa: no session; run 'qa web up --url …' first" >&2; exit 1; }
  . "./$QA_SESSION"
  case "${1:-}" in
    open | back | forward | reload | wait | snapshot | find | get | click | fill | type | press | \
      scroll | screenshot | console | errors | network | status | set) ;;
    *) echo "qa browse: verb '${1:-}' not allowed" >&2; exit 64 ;;
  esac
  [ "$1" != set ] || [ "${2:-}" != headers ] || { echo "qa browse: 'set headers' not allowed" >&2; exit 64; }
  exec anoa --port "$PORT" "$@"
}
