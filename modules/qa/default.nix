{ pkgs, ... }:

let
  anoa = pkgs.callPackage ./anoa.nix { };

  # `qa` dispatcher + per-platform lifecycle libs (see bin/qa).
  qa = pkgs.stdenvNoCC.mkDerivation {
    pname = "qa";
    version = "0.1.0";
    src = ./.;
    dontBuild = true;
    installPhase = ''
      install -Dm755 bin/qa $out/bin/qa
      install -Dm644 -t $out/share/qa lib/*.sh
    '';
  };
in
{
  # Agent-driven QA tooling: anoa is a general-purpose browser (global, like Chrome);
  # platform test runners (maestro, xcodebuild) stay in devshells / Xcode.
  home.packages = [ anoa qa ];
}
