{
  description = "__APP_NAME__ macOS app";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShellNoCC {
          name = "__APP_NAME__";
          packages = with pkgs; [ just xcodegen swiftlint xcbeautify xcodes actionlint ];
          # Apple toolchain must come from Xcode, never from the Nix stdenv.
          shellHook = ''
            unset SDKROOT CC CXX LD AR RANLIB STRIP NIX_CFLAGS_COMPILE NIX_LDFLAGS MACOSX_DEPLOYMENT_TARGET
            source ./scripts/select-xcode.sh
          '';
        };
      });
    };
}
