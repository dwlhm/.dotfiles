{ pkgs, ... }:

{
  imports = [
    ./modules/zsh
  ];

  home.username = "dwlhm";
  home.homeDirectory = "/Users/dwlhm";

  home.stateVersion = "24.11";

  # Let Home Manager install and manage itself
  programs.home-manager.enable = true;

  # Declarative direnv + nix-direnv configuration
  programs.direnv = {
    enable = true;
    nix-direnv.enable = true;
  };

  # Suppress terminal "Last login" message
  home.file.".hushlogin".text = "";

  # Global CLI packages managed declaratively via Home Manager
  home.packages = with pkgs; [
    universal-ctags
    ast-grep
    ols
  ];
}
