# Unified 'nix *' CLI abstraction for devShells, sops-nix identities, and GC

_NIX_DOTFILES="${HOME}/.dotfiles"
_NIX_BINDINGS_FILE="${HOME}/.local/state/nix-envs/bindings.tsv"
_NIX_SOPS_KEY="${HOME}/.config/sops/age/keys.txt"
_NIX_SOPS_SECRETS="${HOME}/.config/sops-nix/secrets"

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
  local token_file="${_NIX_SOPS_SECRETS}/git/${id}/token"
  if [[ -s "$token_file" ]]; then
    export GH_TOKEN="$(<"$token_file")"
  else
    unset GH_TOKEN
  fi
}

_nix_clear_identity_session() {
  unset NIX_ACTIVE_ID GIT_AUTHOR_NAME GIT_COMMITTER_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_EMAIL GIT_SSH_COMMAND GH_TOKEN
}

_nix_deactivate_stack() {
  [[ -n "${_NIX_BASE_PATH:-}" ]] && export PATH="$_NIX_BASE_PATH"
  unset NIX_ACTIVE_STACK _NIX_SESSION_STACK JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT
  _nix_clear_identity_session
}

_nix_activate_stack_in_memory() {
  setopt localoptions pipefail
  local stack="${1#\#}"
  [[ -z "${_NIX_BASE_PATH:-}" ]] && export _NIX_BASE_PATH="$PATH"
  local cache_dir="${HOME}/.cache/nix-envs/env-scripts"
  command mkdir -p "$cache_dir"
  local cache_file="${cache_dir}/${stack}.sh"
  local lock_mtime
  lock_mtime=$(/usr/bin/stat -f%m "${_NIX_DOTFILES}/flake.nix" "${_NIX_DOTFILES}/flake.lock" "${_NIX_DOTFILES}/modules/devshells.nix" 2>/dev/null | /usr/bin/sort -n | /usr/bin/tail -1)
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
  # _NIX_SESSION_STACK marks helper ownership; direnv devshells also export NIX_ACTIVE_STACK.
  export NIX_ACTIVE_STACK="$stack" _NIX_SESSION_STACK="$stack"
}

_nix_save_dir_binding() {
  local dir="$1" stack="$2" id="${3:-}"
  command mkdir -p "${_NIX_BINDINGS_FILE:h}"
  [[ -f "$_NIX_BINDINGS_FILE" ]] && /usr/bin/awk -F'\t' -v d="$dir" '$1 != d' "$_NIX_BINDINGS_FILE" > "${_NIX_BINDINGS_FILE}.tmp" && command mv "${_NIX_BINDINGS_FILE}.tmp" "$_NIX_BINDINGS_FILE"
  [[ -n "$stack" ]] && printf "%s\t%s\t%s\n" "$dir" "$stack" "$id" >> "$_NIX_BINDINGS_FILE"
}

_nix_cmd_change() {
  local -a o_as
  zparseopts -D -E -F -- -as:=o_as || return 1
  local target="${1:-list}" as_id="${o_as[-1]:-}"
  case "$target" in
    list|--list)
      echo "Available stacks: #web #bun #node20 #node16 #odin #swift #android #python"
      [[ -n "${NIX_ACTIVE_STACK:-}" ]] && echo "Active stack    : #${NIX_ACTIVE_STACK} (identity: ${NIX_ACTIVE_ID:-auto})"
      ;;
    off|none|reset)
      _nix_deactivate_stack
      _nix_save_dir_binding "$PWD" "" ""
      echo "❄ Switched back to Thin Global Core"
      ;;
    *)
      local stack="${target#\#}"
      _nix_activate_stack_in_memory "$stack" || return 1
      if [[ -n "$as_id" ]]; then
        _nix_apply_identity_session "$as_id" || return 1
      else
        _nix_clear_identity_session
      fi
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
  local -a o_as o_name o_bundle o_team
  zparseopts -D -E -F -- -as:=o_as -name:=o_name -bundle-id:=o_bundle -team:=o_team || return 1
  local stack="${1#\#}" as_id="${o_as[-1]:-}" name="${o_name[-1]:-${PWD:t}}"
  local bundle_id="${o_bundle[-1]:-}" team="${o_team[-1]:-}" mode="envrc"
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

# Values travel via stdin so secrets never appear in process listings.
_nix_sops_set() {
  SOPS_AGE_KEY_FILE="${_NIX_SOPS_KEY}" sops set --value-stdin "${_NIX_DOTFILES}/secrets/secrets.yaml" "$1"
}

# accounts.json is only updated after both secrets are stored, so a failure never registers a half-written id.
_nix_id_register() {
  setopt localoptions pipefail
  local id="$1" key="$2" name="$3" email="$4" host="$5" org="$6" dir="$7" token="$8"
  local accounts="${_NIX_DOTFILES}/secrets/accounts.json"
  /usr/bin/ssh-keygen -q -t ed25519 -C "$email" -f "$key" -N "" || return 1
  jq -Rs . < "$key" | _nix_sops_set "[\"ssh_keys\"][\"${id}\"]" || return 1
  jq -n --arg name "$name" --arg email "$email" --arg host "$host" --arg org "$org" --arg dir "$dir" --arg token "$token" \
    '{$name, $email, $host, $org, $dir, $token}' | _nix_sops_set "[\"git\"][\"${id}\"]" || return 1
  jq --arg id "$id" 'if index($id) then . else . + [$id] end' "$accounts" > "${accounts}.tmp" \
    && command mv "${accounts}.tmp" "$accounts" || return 1
  /usr/bin/pbcopy < "${key}.pub"
}

_nix_cmd_id_add() {
  local id="${1:-}"
  [[ "$id" =~ '^[A-Za-z0-9_-]+$' ]] || { echo "Usage: nix id add <id> (letters, digits, '-' or '_')" >&2; return 1; }
  local name email host org dir token
  vared -p "Git user.name          : " name
  vared -p "Git user.email         : " email
  host="github.com"; vared -p "Git host               : " host
  org="$name"; vared -p "Git org/user           : " org
  dir="~/project/${id}"; vared -p "Workspace dir          : " dir
  vared -p "Auth token/PAT (opt)   : " token
  local tmp_dir
  tmp_dir=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/nix-id-${id}.XXXXXX") || return 1
  {
    _nix_id_register "$id" "${tmp_dir}/key" "$name" "$email" "$host" "$org" "$dir" "$token" \
      || { echo "nix id add: failed to register '$id'; accounts.json left unchanged" >&2; return 1; }
  } always {
    command rm -rf "$tmp_dir"
  }
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
  local untracked
  untracked=$(command git -C "$_NIX_DOTFILES" ls-files --others --exclude-standard)
  [[ -n "$untracked" ]] && printf 'nix sync: untracked files are invisible to the flake (git add them explicitly):\n%s\n' "$untracked" >&2
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
  local bdir bstack bid match_dir="" match_stack="" match_id=""
  if [[ -f "$_NIX_BINDINGS_FILE" ]]; then
    # Longest matching prefix wins so nested project bindings override their parents.
    while IFS=$'\t' read -r bdir bstack bid; do
      [[ "$PWD" == "$bdir" || "$PWD" == "$bdir"/* ]] && (( ${#bdir} > ${#match_dir} )) || continue
      match_dir="$bdir" match_stack="$bstack" match_id="$bid"
    done < "$_NIX_BINDINGS_FILE"
  fi
  if [[ -z "$match_stack" ]]; then
    [[ -n "${_NIX_SESSION_STACK:-}${NIX_ACTIVE_ID:-}" ]] && _nix_deactivate_stack
    return 0
  fi
  if [[ "${NIX_ACTIVE_STACK:-}" != "$match_stack" ]]; then
    _nix_activate_stack_in_memory "$match_stack" >/dev/null || return 1
  fi
  if [[ "${NIX_ACTIVE_ID:-}" != "$match_id" ]]; then
    if [[ -n "$match_id" ]]; then _nix_apply_identity_session "$match_id"; else _nix_clear_identity_session; fi
  fi
}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _nix_chpwd_binding_hook
unsetopt interactive_comments
_nix_chpwd_binding_hook
