### ✅ Basic Setup
export PATH="/Users/dwlhm/.nix-profile/bin:/nix/var/nix/profiles/default/bin:/Users/dwlhm/.local/bin:/opt/homebrew/bin:$PATH"
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
zinit light jeffreytse/zsh-vi-mode
zinit light romkatv/powerlevel10k

### ⏱ Prompt Theme
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

### ✨ Completion & Styles
zstyle ':completion:*' menu select
zstyle ':fzf-tab:*' fzf-command fzf

### 🧠 Behavior
setopt correct

### 💥 Tools Init (Thin Global Core)
command -v zoxide &>/dev/null && eval "$(zoxide init zsh)"
command -v fzf &>/dev/null && source <(fzf --zsh 2>/dev/null || true)

# Antigravity CLI & IDE
export PATH="/Users/dwlhm/.antigravity/antigravity/bin:/Users/dwlhm/.antigravity-ide/antigravity-ide/bin:$PATH"

# Optional local overrides (not tracked in git)
[[ -f ~/.zshrc.local ]] && source ~/.zshrc.local
