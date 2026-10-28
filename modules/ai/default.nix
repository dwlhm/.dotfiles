{ config, pkgs, lib, ... }:

let
  homeDir = config.home.homeDirectory;
  corePrompt = builtins.readFile ./core.md;

  codexPrompt = corePrompt + "\n" + ''
## Tool Usage

- Use `view` to read files before editing.
- Use `write_file` to create new files; use `apply_patch` for small, targeted edits; avoid rewriting whole files.
- Use `shell` for file and system operations (ls, grep, find, git).
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  zedPrompt = corePrompt + "\n" + ''
## Tool Usage

- Use `edit_file` for small, precise changes; avoid rewriting whole files.
- Use `write_file` to create new files.
- Use built-in search tools (`grep`, `find_path`, `list_directory`) or `terminal` effectively.
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  opencodePrompt = corePrompt + "\n" + ''
## Tool Usage

- Use `edit` for small, precise changes; avoid rewriting whole files.
- Use `write` to create new files.
- Use `grep` for content search, `glob` for file search, and `read` to inspect files before editing.
- Use `shell` for system and git operations.
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  geminiPrompt = corePrompt + "\n" + ''
## Planning & Artifacts (AGY)

- When presenting a plan under the **Approval Gate**, ALWAYS create or update an artifact file (`<appDataDir>/brain/<conversation-id>/implementation_plan.md`) using `write_to_file` with `ArtifactMetadata` (`UserFacing: true`, `RequestFeedback: true`).
- Do not duplicate the full plan in the chat response; point the user to the artifact and highlight only key decisions or open questions that need their review.

## Tool Usage

- In AGY: use `view_file` to inspect files, `replace_file_content` (or `multi_replace_file_content`) for targeted edits, `write_to_file` to create new files or artifacts, and `run_command` for build/test/verification.
- In Gemini CLI: use `read_file`, `replace`, `write_file`, `grep_search`, `glob`, and `run_shell_command`.
- When delegating to subagents (`invoke_subagent`), the parent agent must read `~/brain/` context first and pass relevant invariants in the prompt so subagents never block on out-of-workspace file permissions.
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  claudePrompt = corePrompt + "\n" + ''
## Tool Usage

- Use `View` to inspect files before editing.
- Use `Edit` / `Replace` for small, targeted changes; avoid rewriting whole files.
- Use `Bash` for file, git, and system operations.
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  piPrompt = corePrompt + "\n" + ''
## Tool Usage

- Use `edit` for small, precise changes; avoid rewriting whole files.
- Use `write` to create new files.
- Use `read` to inspect files before editing.
- Use `bash` for file and system operations (ls, grep, find, git).
- Add comments only when the logic is non-obvious or complex.
- Verify changes by running relevant build/test checks without re-reading edited files.
'';

  sharedSkills = [ "better-ui" "context-sync" ];

  mkSkillSymlinks = targetPrefix: lib.listToAttrs (map (skill: {
    name = "${targetPrefix}/${skill}";
    value = {
      source = config.lib.file.mkOutOfStoreSymlink "${homeDir}/.config/ai/skills/${skill}";
    };
  }) sharedSkills);
in
{
  # 1. Base AI Skills & Agent Configs
  xdg.configFile = {
    "ai/skills".source = ./skills;
    "zed/AGENTS.md".text = zedPrompt;
    "opencode/AGENTS.md".text = opencodePrompt;
  } // (mkSkillSymlinks "opencode/skills");

  # 2. CLI Tool & Agent Instructions / Skill Symlinks
  home.file = {
    ".local/bin/ai-outline" = {
      source = ./skills/context-sync/scripts/ai-outline;
      executable = true;
    };
    ".claude/CLAUDE.md".text = claudePrompt;
    ".codex/AGENTS.md".text = codexPrompt;
    ".gemini/GEMINI.md".text = geminiPrompt;
    ".pi/agent/AGENTS.md".text = piPrompt;
  }
  // (mkSkillSymlinks ".claude/skills")
  // (mkSkillSymlinks ".codex/skills")
  // (mkSkillSymlinks ".gemini/config/skills")
  // (mkSkillSymlinks ".pi/agent/skills");
}
