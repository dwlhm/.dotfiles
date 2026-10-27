# Unified 'nix *' CLI abstraction for devShells, sops-nix identities, and GC

_NIX_DOTFILES="${HOME}/.dotfiles"
_NIX_BINDINGS_FILE="${HOME}/.local/state/nix-envs/bindings.tsv"
_NIX_SOPS_KEY="${HOME}/.config/sops/age/keys.txt"

_nix_apply_identity_session() {
  local id="$1"
  local inc="${HOME}/.config/git/identities/id-${id}.inc"
  [[ -f "$inc" ]] || { echo "nix: identity '$id' not found ($inc)" >&2; return 1; }
  local name email
  name=$(git config -f "$inc" user.name 2>/dev/null || true)
  email=$(git config -f "$inc" user.email 2>/dev/null || true)
  [[ -n "$name" ]] && export GIT_AUTHOR_NAME="$name" GIT_COMMITTER_NAME="$name"
  [[ -n "$email" ]] && export GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_EMAIL="$email"
  export GIT_SSH_COMMAND="ssh -i ${HOME}/.ssh/keys/${id} -o IdentitiesOnly=yes"
  export NIX_ACTIVE_ID="$id"
  local token
  token=$(git config -f "$inc" auth.token 2>/dev/null || true)
  if [[ -n "$token" ]]; then
    export GH_TOKEN="$token"
  else
    unset GH_TOKEN
  fi
}

_nix_activate_stack_in_memory() {
  local stack="${1#\#}"
  [[ -z "${_NIX_BASE_PATH:-}" ]] && export _NIX_BASE_PATH="$PATH"
  local cache_dir="${HOME}/.cache/nix-envs/env-scripts"
  command mkdir -p "$cache_dir"
  local cache_file="${cache_dir}/${stack}.sh"
  local lock_mtime
  lock_mtime=$(/usr/bin/stat -f%m "${_NIX_DOTFILES}/flake.lock" "${_NIX_DOTFILES}/modules/devshells.nix" 2>/dev/null | /usr/bin/sort -n | /usr/bin/tail -1)
  local cache_mtime
  cache_mtime=$(/usr/bin/stat -f%m "$cache_file" 2>/dev/null || echo 0)
  if (( cache_mtime < lock_mtime )) || [[ ! -s "$cache_file" ]]; then
    echo "❄ Building environment #${stack}..."
    command nix print-dev-env --json "${_NIX_DOTFILES}#${stack}" | /usr/bin/jq -r '
      "export PATH=" + (.variables.PATH.value | @sh) + ":\"$PATH\"\n" +
      (.variables.shellHook.value // "")
    ' > "$cache_file" || { rm -f "$cache_file"; return 1; }
  fi
  export PATH="$_NIX_BASE_PATH"
  source "$cache_file"
  export NIX_ACTIVE_STACK="$stack"
}

_nix_save_dir_binding() {
  local dir="$1" stack="$2" id="${3:-}"
  command mkdir -p "${_NIX_BINDINGS_FILE:h}"
  [[ -f "$_NIX_BINDINGS_FILE" ]] && /usr/bin/awk -F'\t' -v d="$dir" '$1 != d' "$_NIX_BINDINGS_FILE" > "${_NIX_BINDINGS_FILE}.tmp" && command mv "${_NIX_BINDINGS_FILE}.tmp" "$_NIX_BINDINGS_FILE"
  [[ -n "$stack" ]] && printf "%s\t%s\t%s\n" "$dir" "$stack" "$id" >> "$_NIX_BINDINGS_FILE"
}

_nix_cmd_change() {
  local target="${1:-list}" as_id=""
  (( $# > 0 )) && shift
  while (( $# > 0 )); do
    [[ "$1" == "--as" && -n "${2:-}" ]] && { as_id="$2"; shift 2; continue; }
    shift
  done
  case "$target" in
    list|--list)
      echo "Available stacks: #web #bun #node20 #node16 #odin #swift #android #python"
      [[ -n "${NIX_ACTIVE_STACK:-}" ]] && echo "Active stack    : #${NIX_ACTIVE_STACK} (identity: ${NIX_ACTIVE_ID:-auto})"
      ;;
    off|none|reset)
      [[ -n "${_NIX_BASE_PATH:-}" ]] && export PATH="$_NIX_BASE_PATH"
      unset NIX_ACTIVE_STACK NIX_ACTIVE_ID GIT_AUTHOR_NAME GIT_COMMITTER_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_EMAIL GIT_SSH_COMMAND JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT GH_TOKEN
      _nix_save_dir_binding "$PWD" "" ""
      echo "❄ Switched back to Thin Global Core"
      ;;
    *)
      local stack="${target#\#}"
      _nix_activate_stack_in_memory "$stack" || return 1
      [[ -n "$as_id" ]] && _nix_apply_identity_session "$as_id"
      _nix_save_dir_binding "$PWD" "$stack" "$as_id"
      echo "❄ Active stack: #${stack}${as_id:+ (as $as_id)}"
      ;;
  esac
}

_nix_has_template() {
  command nix eval --json "${_NIX_DOTFILES}#templates" --apply builtins.attrNames 2>/dev/null \
    | /usr/bin/jq -e --arg s "$1" 'index($s) != null' >/dev/null
}

# Copies flake template <stack> into $PWD and fills __APP_NAME__/__BUNDLE_ID__/__TEAM_ID__.
_nix_scaffold_template() {
  local stack="$1" name="$2" bundle_id="$3" team="$4" file
  [[ "$name" =~ '^[A-Za-z][A-Za-z0-9]*$' ]] || { echo "nix init: --name must be alphanumeric (got '$name')" >&2; return 1; }
  [[ "$bundle_id" =~ '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' ]] || { echo "nix init: --bundle-id <reverse.dns.id> is required for #${stack}" >&2; return 1; }
  [[ "$team" =~ '^[A-Z0-9]*$' ]] || { echo "nix init: --team must be an Apple Team ID" >&2; return 1; }
  command nix flake init -t "${_NIX_DOTFILES}#${stack}" || return 1
  for file in ${(f)"$(command grep -rlI --exclude-dir=.git -e __APP_NAME__ -e __BUNDLE_ID__ -e __TEAM_ID__ .)"}; do
    /usr/bin/sed -i '' -e "s/__APP_NAME__/${name}/g" -e "s/__BUNDLE_ID__/${bundle_id}/g" -e "s/__TEAM_ID__/${team}/g" "$file"
  done
}

# Stacks with a flake template get a self-contained project; others bind .envrc to the dotfiles devShell.
_nix_cmd_init() {
  local stack="" as_id="" name="${PWD:t}" bundle_id="" team="" mode="envrc"
  while (( $# > 0 )); do
    case "$1" in
      --as) as_id="${2:-}"; shift 2 ;;
      --name) name="${2:-}"; shift 2 ;;
      --bundle-id) bundle_id="${2:-}"; shift 2 ;;
      --team) team="${2:-}"; shift 2 ;;
      *) stack="${1#\#}"; shift ;;
    esac
  done
  [[ -z "$stack" ]] && { echo "Usage: nix init #<stack> [--as <id>] [--name <App> --bundle-id <id> [--team <ID>]]" >&2; return 1; }
  [[ -d .git ]] || command git init
  if _nix_has_template "$stack"; then
    mode="template"
    _nix_scaffold_template "$stack" "$name" "$bundle_id" "$team" || return 1
  else
    echo "use flake ${_NIX_DOTFILES}#${stack}" > .envrc
  fi
  [[ -n "$as_id" ]] && _nix_cmd_id use "$as_id"
  command direnv allow
  echo "❄ Initialized #${stack} (${mode}) | Git: $(git config user.name 2>/dev/null || echo unbound) <$(git config user.email 2>/dev/null || echo unbound)>"
}

_nix_cmd_id_add() {
  local id="${1:-}"
  [[ -z "$id" ]] && { echo "Usage: nix id add <id>" >&2; return 1; }
  local name email host org dir token
  vared -p "Git user.name          : " name
  vared -p "Git user.email         : " email
  host="github.com"; vared -p "Git host               : " host
  org="$name"; vared -p "Git org/user           : " org
  dir="~/project/${id}"; vared -p "Workspace dir          : " dir
  vared -p "Auth token/PAT (opt)   : " token
  local tmp_key
  tmp_key=$(/usr/bin/mktemp -u "${TMPDIR:-/tmp}/nix-id-${id}.XXXXXX")
  /usr/bin/ssh-keygen -t ed25519 -C "$email" -f "$tmp_key" -N "" >/dev/null
  local key_json name_json email_json host_json org_json dir_json token_json
  key_json=$(jq -Rs . < "$tmp_key")
  name_json=$(jq -Rn --arg v "$name" '$v')
  email_json=$(jq -Rn --arg v "$email" '$v')
  host_json=$(jq -Rn --arg v "$host" '$v')
  org_json=$(jq -Rn --arg v "$org" '$v')
  dir_json=$(jq -Rn --arg v "$dir" '$v')
  token_json=$(jq -Rn --arg v "$token" '$v')
  local sops_file="${_NIX_DOTFILES}/secrets/secrets.yaml"
  SOPS_AGE_KEY_FILE="${_NIX_SOPS_KEY}" sops --set "[\"ssh_keys\"][\"${id}\"] ${key_json}" "$sops_file"
  SOPS_AGE_KEY_FILE="${_NIX_SOPS_KEY}" sops --set "[\"git\"][\"${id}\"] {\"name\":${name_json},\"email\":${email_json},\"host\":${host_json},\"org\":${org_json},\"dir\":${dir_json},\"token\":${token_json}}" "$sops_file"
  jq --arg id "$id" 'if index($id) then . else . + [$id] end' "${_NIX_DOTFILES}/secrets/accounts.json" > "${_NIX_DOTFILES}/secrets/accounts.json.tmp"
  command mv "${_NIX_DOTFILES}/secrets/accounts.json.tmp" "${_NIX_DOTFILES}/secrets/accounts.json"
  /usr/bin/pbcopy < "${tmp_key}.pub"
  command rm -f "$tmp_key" "${tmp_key}.pub"
  echo "🔑 Public key copied to clipboard! Running nix sync..."
  _nix_cmd_sync
}

_nix_cmd_id() {
  local sub="${1:-list}"
  (( $# > 0 )) && shift
  case "$sub" in
    list)
      echo "Registered identities: $(jq -r 'join(", ")' "${_NIX_DOTFILES}/secrets/accounts.json")"
      echo "Current dir identity : $(git config user.name 2>/dev/null || echo none) <$(git config user.email 2>/dev/null || echo none)>"
      ;;
    use)
      local id="${1:-}"
      [[ -z "$id" ]] && id=$(jq -r '.[]' "${_NIX_DOTFILES}/secrets/accounts.json" | fzf --prompt="Select Git identity > ")
      [[ -z "$id" ]] && return 1
      command git config --local include.path "~/.config/git/identities/id-${id}.inc"
      echo "✓ Bound repository to identity '$id' ($(git config user.name) <$(git config user.email)>)"
      ;;
    add) _nix_cmd_id_add "$@" ;;
    *) echo "Usage: nix id [list|use <id>|add <id>]" >&2; return 1 ;;
  esac
}

_nix_cmd_sync() {
  command git -C "$_NIX_DOTFILES" add -N . 2>/dev/null || true
  command home-manager switch -b backup --flake "$_NIX_DOTFILES"
}

_nix_cmd_gc() {
  local run_mac=0
  [[ "${1:-}" == "--mac" ]] && run_mac=1
  echo "📊 Disk before GC: $(/bin/df -h / | /usr/bin/awk 'NR==2 {print $4 " available (" $5 " used)"}')"
  command rm -rf "${HOME}/.cache/direnv/layouts"/* "${HOME}/.cache/nix-envs/env-scripts"/* 2>/dev/null || true
  command home-manager expire-generations "-7 days" 2>/dev/null || true
  command nix-collect-garbage -d
  command nix store optimise
  (( run_mac )) && command -v mo >/dev/null 2>&1 && command mo clean
  echo "📊 Disk after GC : $(/bin/df -h / | /usr/bin/awk 'NR==2 {print $4 " available (" $5 " used)"}')"
}

unalias nix 2>/dev/null || true
nix() {
  case "${1:-}" in
    change) shift; _nix_cmd_change "$@" ;;
    init)   shift; _nix_cmd_init "$@" ;;
    id)     shift; _nix_cmd_id "$@" ;;
    secret) shift; SOPS_AGE_KEY_FILE="${_NIX_SOPS_KEY}" sops "${_NIX_DOTFILES}/secrets/secrets.yaml" && _nix_cmd_sync ;;
    sync)   shift; _nix_cmd_sync ;;
    gc)     shift; _nix_cmd_gc "$@" ;;
    *)      command nix "$@" ;;
  esac
}
alias nix='noglob nix'

_nix_chpwd_binding_hook() {
  [[ -f "$_NIX_BINDINGS_FILE" ]] || return 0
  local match_stack="" match_id=""
  while IFS=$'\t' read -r bdir bstack bid; do
    if [[ "$PWD" == "$bdir" || "$PWD" == "$bdir"/* ]]; then
      match_stack="$bstack"; match_id="$bid"
    fi
  done < "$_NIX_BINDINGS_FILE"
  if [[ -n "$match_stack" && "${NIX_ACTIVE_STACK:-}" != "$match_stack" ]]; then
    _nix_activate_stack_in_memory "$match_stack" >/dev/null
    [[ -n "$match_id" ]] && _nix_apply_identity_session "$match_id"
  fi
}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _nix_chpwd_binding_hook
unsetopt interactive_comments
_nix_chpwd_binding_hook
