{ config, pkgs, lib, ... }:

{
  programs.zsh = {
    enable = true;
    package = pkgs.emptyDirectory;
    enableCompletion = true;
    autocd = true;

    history = {
      size = 10000;
      save = 10000;
      path = "${config.home.homeDirectory}/.zsh_history";
      ignoreDups = true;
      share = true;
    };

    shellAliases = {
      ls = "eza -lah --color=always --icons";
      cat = "bat";
      grep = "rg";
      ".." = "cd ..";
      "..." = "cd ../..";
      "~" = "cd ~";
      zshconfig = "nvim ~/.dotfiles/modules/zsh";
      reload = "source ~/.zshrc";
    };

    initContent = lib.mkMerge [
      (lib.mkBefore (builtins.readFile ./first.zsh))
      (lib.mkAfter (
        (builtins.readFile ./extra.zsh)
        + "\n"
        + (builtins.readFile ./nix-helpers.zsh)
      ))
    ];

    envExtra = ''
      export SOPS_AGE_KEY_FILE="$HOME/.config/sops/age/keys.txt"
      if ! command -v nix >/dev/null 2>&1 && [[ -e /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]]; then
        . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
      fi
      export PATH="$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$HOME/.local/bin:$PATH"
      if ! command -v python3 >/dev/null 2>&1 || [[ ! -x "$(command -v python3)" ]]; then
        if [[ -d /Library/Developer/CommandLineTools/usr/bin ]]; then
          export DEVELOPER_DIR="/Library/Developer/CommandLineTools"
          export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
        fi
      fi
    '';

    profileExtra = ''
      [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
      [[ -f ~/.orbstack/shell/init.zsh ]] && source ~/.orbstack/shell/init.zsh 2>/dev/null || :
      export PATH="$HOME/.local/bin:$HOME/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH:/Users/dwlhm/Library/Application Support/JetBrains/Toolbox/scripts"
    '';
  };
}
