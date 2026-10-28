{ config, ... }:

{
  # Two-way mutable workflow: edits within Zed GUI or hotkeys persist directly
  # to the dotfiles repository without being locked to a read-only Nix store path.
  xdg.configFile."zed/settings.json".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.dotfiles/modules/zed/settings.json";
}
