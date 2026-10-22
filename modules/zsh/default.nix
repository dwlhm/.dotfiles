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
      nvd = "NVIM_APPNAME=nvdwlhm nvim";
      nd = "NVIM_APPNAME=nvim-dwlhm nvim";
      v = "NVIM_APPNAME=nvim-cstm nvim";
      inspect = "tail -f ~/.omp/logs/omp.*.log";
    };

    initContent = lib.mkMerge [
      (lib.mkBefore (builtins.readFile ./first.zsh))
      (lib.mkAfter (builtins.readFile ./extra.zsh))
    ];

    envExtra = ''
      [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
      if [[ ! -x /opt/homebrew/bin/python3 && -d /Library/Developer/CommandLineTools/usr/bin ]]; then
        export DEVELOPER_DIR="/Library/Developer/CommandLineTools"
        export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
      fi
    '';

    profileExtra = ''
      eval "$(/opt/homebrew/bin/brew shellenv)"
      [ -f ~/.orbstack/shell/init.zsh ] && source ~/.orbstack/shell/init.zsh 2>/dev/null || :
      export PATH="$PATH:/Users/dwlhm/Library/Application Support/JetBrains/Toolbox/scripts"
      export PATH="/Users/dwlhm/.local/bin:/Users/dwlhm/.nix-profile/bin:/nix/var/nix/profiles/default/bin:$PATH"
    '';
  };
}
