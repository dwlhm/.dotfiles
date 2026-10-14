# dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## Setup on a new machine

```sh
brew install chezmoi
chezmoi init --apply --source ~/.dotfiles
```

## Daily Usage

- Check differences:
  ```sh
  chezmoi diff
  ```
- Apply changes to machine:
  ```sh
  chezmoi apply
  ```

## Workflows & Guides

- [Tmux + Neovim + AI Agent Workflow](docs/tmux-workflow.md): Panduan workflow pairing terminal multiplexer, Ghostty, Neovim, dan AI Coding Agent CLI.
