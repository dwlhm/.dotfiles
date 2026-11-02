{ pkgs }:

let
  mkLeanShell = name: packages: extraHook:
    pkgs.mkShellNoCC {
      inherit name packages;
      shellHook = ''
        export NIX_ACTIVE_STACK="${name}"
        ${extraHook}
      '';
    };

  # Prebuilt upstream binaries for Node lines nixpkgs has dropped (EOL).
  mkNodeBin = version: sha256: pkgs.stdenvNoCC.mkDerivation {
    pname = "nodejs";
    inherit version;
    src = pkgs.fetchurl {
      url = "https://nodejs.org/dist/v${version}/node-v${version}-darwin-arm64.tar.gz";
      inherit sha256;
    };
    dontConfigure = true;
    dontBuild = true;
    installPhase = ''
      mkdir -p $out
      cp -R bin include lib share $out/
    '';
  };

  nodejs_16 = mkNodeBin "16.20.2" "6a5c4108475871362d742b988566f3fe307f6a67ce14634eb3fbceb4f9eea88c";
  nodejs_20 = mkNodeBin "20.20.2" "466e05f3477c20dfb723054dfebffe55bc74660ee77f612166fca121dacb65b6";

  webShell = mkLeanShell "web" [
    pkgs.nodejs
    pkgs.pnpm
  ] "";
in {
  default = webShell;
  web = webShell;

  bun = mkLeanShell "bun" [
    pkgs.bun
  ] "";

  node20 = mkLeanShell "node20" [
    nodejs_20
    (pkgs.pnpm_10.override { nodejs = nodejs_20; })
  ] "";

  node16 = mkLeanShell "node16" [
    nodejs_16
    (pkgs.yarn.override { nodejs = nodejs_16; })
  ] "";

  odin = mkLeanShell "odin" (with pkgs; [
    odin
    ols
  ]) "";

  # Scratch only; real apps use `nix init #swift` (self-contained template).
  swift = mkLeanShell "swift" (with pkgs; [
    swiftlint
    xcbeautify
  ]) ''
    unset SDKROOT CC CXX LD AR RANLIB STRIP
    if [[ -d "/Applications/Xcode.app/Contents/Developer" ]]; then
      export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
    fi
  '';

  android = mkLeanShell "android" [ pkgs.maestro ] ''
    if [[ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]]; then
      export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
      export PATH="$JAVA_HOME/bin:$PATH"
    fi
    if [[ -d "$HOME/Library/Android/sdk" ]]; then
      export ANDROID_HOME="$HOME/Library/Android/sdk"
      export ANDROID_SDK_ROOT="$ANDROID_HOME"
      export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
    fi
  '';

  python = mkLeanShell "python" (with pkgs; [
    python3
    uv
    ruff
  ]) "";
}
