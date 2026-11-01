{ config, pkgs, lib, ... }:

let
  src = lib.fileset.toSource {
    root = ./cli;
    fileset = lib.fileset.fileFilter (f: f.hasExt "ts" && !lib.hasSuffix ".test.ts" f.name && f.name != "fake.ts") ./cli;
  };

  board = pkgs.writeShellApplication {
    name = "board";
    runtimeInputs = [ pkgs.bun pkgs.git ];
    text = ''exec bun ${src}/cli.ts "$@"'';
    # Bundling resolves every static import: a module missing from the package fails the build.
    checkPhase = ''
      runHook preCheck
      ${pkgs.stdenv.shellDryRun} "$target"
      HOME="$TMPDIR" ${pkgs.bun}/bin/bun build --target=bun --outdir "$TMPDIR/board-bundle" ${src}/cli.ts >/dev/null
      runHook postCheck
    '';
  };
  mod = ./mod;
in
{
  # Kanban tasks for the person and their agents (see README.md). Tasks live in
  # ~/.local/state/board/tasks; the Herdr mod is the view.
  home.packages = [ board ];

  # Herdr writes into every mod folder (jsconfig.json, type files), so our files are copied in,
  # not linked to the read-only store; only our own files are touched.
  home.activation.boardMod = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    herdr="${config.home.homeDirectory}/.config/herdr-app"
    if [ -d "$herdr" ]; then
      run mkdir -p "$herdr/mods/board"
      for f in ${mod}/*; do
        run install -m 644 "$f" "$herdr/mods/board/$(basename "$f")"
      done
    fi
  '';
}
