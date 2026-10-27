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

  nodejs_16 = pkgs.stdenvNoCC.mkDerivation {
    pname = "nodejs";
    version = "16.20.2";
    src = pkgs.fetchurl {
      url = "https://nodejs.org/dist/v16.20.2/node-v16.20.2-darwin-arm64.tar.gz";
      sha256 = "6a5c4108475871362d742b988566f3fe307f6a67ce14634eb3fbceb4f9eea88c";
    };
    dontConfigure = true;
    dontBuild = true;
    installPhase = ''
      mkdir -p $out
      cp -R bin include lib share $out/
    '';
  };

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
    pkgs.nodejs_20
    (pkgs.pnpm.override { nodejs = pkgs.nodejs_20; })
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

  android = mkLeanShell "android" [ ] ''
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
