{ pkgs, lib, ... }:

let
  # Runtime files only: tests and their kit stay in the repo.
  runtime = f: f.hasExt "md" || (f.hasExt "ts" && !lib.hasSuffix ".test.ts" f.name && f.name != "testkit.ts");
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./spec
      (lib.fileset.fileFilter runtime ./engine)
      (lib.fileset.fileFilter runtime ./adapters)
    ];
  };

  wf = pkgs.writeShellApplication {
    name = "wf";
    runtimeInputs = [ pkgs.bun ];
    text = ''exec bun ${src}/engine/cli.ts "$@"'';
    # A broken spec fails the build (and so `nix sync`) with the exact file and field.
    checkPhase = ''
      runHook preCheck
      ${pkgs.stdenv.shellDryRun} "$target"
      HOME="$TMPDIR" ${pkgs.bun}/bin/bun ${src}/engine/cli.ts lint
      runHook postCheck
    '';
  };
in
{
  # Multi-agent workflow engine (see README.md). Config only: records live in ~/brain/tasks,
  # runtime state in ~/.local/state/wf.
  home.packages = [ wf ];
}
