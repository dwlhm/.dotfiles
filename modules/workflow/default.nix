{ config, pkgs, lib, ... }:

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
      # Bundling resolves every static import: a module missing from the package fails here,
      # not later when `wf serve` first starts.
      HOME="$TMPDIR" ${pkgs.bun}/bin/bun build --target=bun --outdir "$TMPDIR/wf-bundle" ${src}/engine/cli.ts ${src}/engine/server.ts >/dev/null
      runHook postCheck
    '';
  };
in
{
  # Multi-agent workflow engine (see README.md). Config only: records live in ~/brain/tasks,
  # runtime state in ~/.local/state/wf.
  home.packages = [ wf ];

  # The wf board mod for Herdr (adapters/host/herdr/board). Herdr writes into every mod folder
  # (jsconfig.json, type files), so the files are copied in, not linked to the read-only store;
  # only our two files are touched.
  home.activation.wfBoardMod = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    herdr="${config.home.homeDirectory}/.config/herdr-app"
    if [ -d "$herdr" ]; then
      run mkdir -p "$herdr/mods/wf-board"
      run install -m 644 ${./adapters/host/herdr/board/main.js} "$herdr/mods/wf-board/main.js"
      run install -m 644 ${./adapters/host/herdr/board/mod.json} "$herdr/mods/wf-board/mod.json"
    fi
  '';

  # agy's only strict enforcement is a PreToolUse hook (adapters/runners/agy). hooks.json is shared
  # with other integrations, so merge our "wf-worker" key instead of owning the file. The hook is
  # silent outside wf runs.
  home.activation.wfAgyHook = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    agyConfig="${config.home.homeDirectory}/.gemini/config"
    if [ -d "$agyConfig" ]; then
      hooks="$agyConfig/hooks.json" merged=$(mktemp)
      { [ -s "$hooks" ] && cat "$hooks" || echo '{}'; } | ${pkgs.jq}/bin/jq \
        --arg c "${wf}/bin/wf hook agy" \
        '. + {"wf-worker": {PreToolUse: [{matcher: "*", hooks: [{command: $c, timeout: 10}]}]}}' > "$merged"
      run cp "$merged" "$hooks"
      rm -f "$merged"
    fi
  '';
}
