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
