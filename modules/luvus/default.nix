{ config, pkgs, lib, ... }:

let
  # Only the settings we own. Luvus rewrites config.json atomically (a symlink would be
  # replaced), so merge these keys into its live file and leave the rest app-managed.
  managed = {
    layout.agent_title = true;
    notifications.sound_on_blocked = true;
  };
in
{
  home.activation.luvusConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    cfg="${config.home.homeDirectory}/.luvus/config.json"
    if [ -f "$cfg" ] && [ ! -L "$cfg" ]; then
      merged=$(mktemp)
      ${pkgs.jq}/bin/jq --argjson m '${builtins.toJSON managed}' '. * $m' "$cfg" > "$merged"
      run cp "$merged" "$cfg"
      rm -f "$merged"
    fi
  '';
}
