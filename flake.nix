{
  description = "dwlhm's Home Manager & DevShell Flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, sops-nix, ... }:
    let
      system = "aarch64-darwin";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      homeConfigurations."dwlhm" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [
          sops-nix.homeManagerModules.sops
          ./home.nix
        ];
      };

      devShells.${system} = import ./modules/devshells.nix { inherit pkgs; };

      # Self-contained project scaffolds consumed by `nix init #<stack>`.
      templates.swift = {
        path = ./templates/swift;
        description = "macOS SwiftUI app: XcodeGen, pinned Xcode, Direct (Developer ID + Sparkle) and App Store channels";
      };
    };
}
