# anoa: agent-controllable Chromium browser (https://anoa.jonggrang.dev, MIT). Not in nixpkgs;
# packaged from the signed + notarized universal release. Bump `version` and `hash` to upgrade.
{ stdenvNoCC, fetchurl }:

stdenvNoCC.mkDerivation rec {
  pname = "anoa";
  version = "0.19.1";

  src = fetchurl {
    url = "https://github.com/porcupine-md/anoa-browser/releases/download/v${version}/anoa-macos-universal.tar.gz";
    hash = "sha256-oZq0aFfNBGY9gWR2CG0oMw3mzx7Byn2eR2OtOW47hUk=";
  };

  sourceRoot = ".";
  dontBuild = true;
  dontFixup = true; # keep the notarized bundle byte-identical (no strip / rpath patching)

  installPhase = ''
    mkdir -p $out/Applications $out/bin
    cp -R anoa.app $out/Applications/
    # Exec through a wrapper so Qt resolves its bundle resources from the real .app path.
    cat > $out/bin/anoa <<SH
    #!/bin/sh
    exec "$out/Applications/anoa.app/Contents/MacOS/anoa" "\$@"
    SH
    chmod +x $out/bin/anoa
  '';
}
