{ pkgs, lib, ... }:

let
  # Runtime files only: tests, fixtures and QA flows stay in the repo.
  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [ ./server.ts ./web ];
  };

  docs = pkgs.writeShellApplication {
    name = "docs";
    runtimeInputs = [ pkgs.bun ];
    text = ''exec bun ${src}/server.ts "$@"'';
  };
in
{
  # Read-only web viewer for ~/brain and ~/.dotfiles markdown (see README.md).
  home.packages = [ docs ];
}
