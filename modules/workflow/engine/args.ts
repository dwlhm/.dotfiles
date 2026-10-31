// `wf <command> "<what>" [option value…]…`, with options and what they take from spec/commands.md.
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Spec } from "./spec";
import type { Submit } from "./types";

export class UsageError extends Error {}

const expand = (p: string, cwd: string) => {
  const home = p === "~" ? homedir() : p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
  return isAbsolute(home) ? home : resolve(cwd, home);
};

function value(takes: string, raw: string[], name: string, env: Record<string, string | undefined>, cwd: string): unknown {
  if (takes === "nothing") return true;
  if (!raw.length) throw new UsageError(`'${name}' needs ${takes === "paths" || takes === "agents" ? `one or more ${takes}` : `a ${takes}`}`);
  if (takes === "paths" || takes === "agents") return raw;
  if (raw.length > 1) throw new UsageError(`'${name}' takes one ${takes}; got ${raw.map((r) => JSON.stringify(r)).join(" ")} (quote it)`);
  if (takes === "folder") {
    const dir = expand(raw[0], cwd);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`'${name} ${raw[0]}': no such folder`);
    return dir;
  }
  if (takes === "terminal" && raw[0] === "me") {
    if (!env.HC_TERMINAL_ID) throw new UsageError("'report-to me' works only inside an hc terminal ($HC_TERMINAL_ID is not set)");
    return env.HC_TERMINAL_ID;
  }
  return raw[0];
}

/** Parse the words after `wf`. `cwd` is the default folder (the focused pane's). */
export function parseCommand(spec: Spec, argv: string[], cwd: string, env: Record<string, string | undefined>): Submit {
  const [name, goal, ...rest] = argv;
  const cmd = spec.commands.get(name);
  if (!cmd) throw new UsageError(`unknown command '${name}'`);
  if (!goal?.trim() || spec.options.has(goal)) throw new UsageError(`what should '${name}' do? e.g. wf ${cmd.example}`);
  const options: Record<string, unknown> = {};
  let i = 0;
  while (i < rest.length) {
    const word = rest[i].replace(/^--/, "");
    if (!cmd.options.includes(word)) {
      const hint = rest[i].startsWith("#") ? ` Quote it with what comes before: wf ${name} "${goal} ${rest[i]}"` : " Quote text that contains spaces.";
      throw new UsageError(`'${rest[i]}' is not an option of '${name}' (options: ${cmd.options.join(", ")}).${hint}`);
    }
    if (word in options) throw new UsageError(`'${word}' is given twice`);
    let j = i + 1;
    while (j < rest.length && !cmd.options.includes(rest[j].replace(/^--/, ""))) j++;
    const takes = spec.options.get(word)!.takes;
    if (takes === "nothing" && j > i + 1) throw new UsageError(`'${word}' takes nothing; unexpected ${JSON.stringify(rest[i + 1])}`);
    options[word] = value(takes, rest.slice(i + 1, j), word, env, cwd);
    i = j;
  }
  if (options["ask-first"] && options["just-go"]) throw new UsageError("'ask-first' and 'just-go' contradict each other");
  const folder = (options.in as string | undefined) ?? cwd;
  delete options.in;
  return { command: name, goal: goal.trim(), folder, options };
}
