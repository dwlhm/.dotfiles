{ pkgs, config, ... }:

let
  peekaboo = pkgs.stdenvNoCC.mkDerivation rec {
    pname = "peekaboo";
    version = "4.9.6";

    src = pkgs.fetchurl {
      url = "https://github.com/openclaw/Peekaboo/releases/download/v${version}/peekaboo-macos-arm64.tar.gz";
      sha256 = "5c7de67ba1505d95843e83c154856c9fb93b1d1c4ce626d66a8be0c6e265dc83";
    };

    dontConfigure = true;
    dontBuild = true;
    dontFixup = true;

    installPhase = ''
      mkdir -p $out/libexec $out/bin
      cp -p peekaboo $out/libexec/
      for dylib in libswiftCompatibility*.dylib; do
        [ -e "$dylib" ] && cp -p "$dylib" $out/libexec/
      done
      chmod 0755 $out/libexec/*
      ln -s $out/libexec/peekaboo $out/bin/peekaboo
    '';
  };

  moleAnalyzeBin = pkgs.fetchurl {
    url = "https://github.com/tw93/Mole/releases/download/V1.62.0/analyze-darwin-arm64";
    sha256 = "a151ced5f9963bdc43a2d3b05d1db4933b9a56db7c4500d4b182436f303b86bd";
  };

  moleStatusBin = pkgs.fetchurl {
    url = "https://github.com/tw93/Mole/releases/download/V1.62.0/status-darwin-arm64";
    sha256 = "d874dfdbeb80cb12cd203d798bf584612d1af0ff0749ee01f9a3936842e54785";
  };

  moleCli = pkgs.stdenvNoCC.mkDerivation rec {
    pname = "mole";
    version = "1.62.0";

    src = pkgs.fetchurl {
      url = "https://github.com/tw93/Mole/archive/refs/tags/V${version}.tar.gz";
      sha256 = "7d40db09a560096caf3eecab2e335f6f42d80a2c43e45693d8aa33227bde7894";
    };

    dontConfigure = true;
    dontBuild = true;
    dontFixup = true;

    installPhase = ''
      mkdir -p $out/libexec $out/bin
      cp -R mole bin lib $out/libexec/
      cp ${moleAnalyzeBin} $out/libexec/bin/analyze-go
      cp ${moleStatusBin} $out/libexec/bin/status-go
      chmod -R u+w $out/libexec
      chmod 0755 $out/libexec/mole $out/libexec/bin/*
      ln -s $out/libexec/mole $out/bin/mole
      ln -s $out/libexec/mole $out/bin/mo
    '';
  };
in
{
  imports = [
    ./modules/zsh
    ./modules/git
    ./modules/tmux
    ./modules/zed
    ./modules/ai
    ./modules/luvus
    ./modules/qa
    ./modules/docs
  ];

  home.username = "dwlhm";
  home.homeDirectory = "/Users/dwlhm";
  home.stateVersion = "24.11";

  programs.home-manager.enable = true;

  # Declarative direnv + nix-direnv with out-of-tree layout cache
  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
    stdlib = ''
      : "''${XDG_CACHE_HOME:="''${HOME}/.cache"}"
      declare -A direnv_layout_dirs
      direnv_layout_dir() {
        local hash path
        echo "''${direnv_layout_dirs[$PWD]:=$(
          hash="$(shasum -a 256 - <<< "$PWD" | cut -c 1-12)"
          path="''${PWD//[^a-zA-Z0-9]/-}"
          echo "''${XDG_CACHE_HOME}/direnv/layouts/''${hash}''${path}"
        )}"
      }
    '';
  };

  home.file.".hushlogin".text = "";
  home.file."Library/Application Support/sops/age/keys.txt".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.config/sops/age/keys.txt";

  home.sessionVariables = {
    SOPS_AGE_KEY_FILE = "${config.home.homeDirectory}/.config/sops/age/keys.txt";
  };

  # Thin Global Core CLI packages managed declaratively via Home Manager
  home.packages = with pkgs; [
    # Search, Navigation & File Inspection
    ripgrep
    fd
    bat
    eza
    fzf
    zoxide
    jq
    btop
    yazi

    # Git, Secrets & Credentials
    lazygit
    sops
    age
    ssh-to-age

    # Editors, Multiplexer & Core Runtime
    neovim
    python3

    # AI Code Intelligence & System Maintenance
    universal-ctags
    ast-grep
    peekaboo
    moleCli
    claude-code
  ];
}
