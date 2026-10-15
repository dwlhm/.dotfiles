### ✅ Basic Setup
export PATH="/opt/homebrew/bin:$PATH"
export LANG="en_US.UTF-8"

### 🚀 Zinit Init
if [[ ! -f $HOME/.local/share/zinit/zinit.git/zinit.zsh ]]; then
    print -P "%F{33} %F{220}Installing %F{33}ZDHARMA-CONTINUUM%F{220} Initiative Plugin Manager (%F{33}zdharma-continuum/zinit%F{220})…%f"
    command mkdir -p "$HOME/.local/share/zinit" && command chmod g-rwX "$HOME/.local/share/zinit"
    command git clone https://github.com/zdharma-continuum/zinit "$HOME/.local/share/zinit/zinit.git" && \
        print -P "%F{33} %F{34}Installation successful.%f%b" || \
        print -P "%F{160} The clone has failed.%f%b"
fi

source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

### 🔌 Plugins
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-syntax-highlighting
zinit light Aloxaf/fzf-tab
zinit light jeffreytse/zsh-vi-mode         # optional: Vim keybindings
zinit light rupa/z                         # z (cd via history)
zinit light wting/autojump                 # autojump support
zinit light romkatv/powerlevel10k          # fancy prompt

### ⏱ Prompt Theme
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

### ✨ Completion & Styles
zstyle ':completion:*' menu select
zstyle ':fzf-tab:*' fzf-command fzf

### 🧠 Behavior
setopt correct         # auto correct typo command

### 💥 Tools Init
[ -f /opt/homebrew/etc/profile.d/autojump.sh ] && source /opt/homebrew/etc/profile.d/autojump.sh
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# pnpm
export PNPM_HOME="/Users/dwlhm/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

[ -f "/Users/dwlhm/.ghcup/env" ] && . "/Users/dwlhm/.ghcup/env" # ghcup-env

# Antigravity CLI & IDE
export PATH="/Users/dwlhm/.antigravity/antigravity/bin:$PATH"
export PATH="/Users/dwlhm/.antigravity-ide/antigravity-ide/bin:$PATH"
export PATH="/Users/dwlhm/.local/bin:$PATH"

# Expose Android Development Toolbox from JetBrains Toolbox
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

export PATH="/Users/dwlhm/.nimble/bin:$PATH"

[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"

# Optional local overrides (not tracked in git)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
