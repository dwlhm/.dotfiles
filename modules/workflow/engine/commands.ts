// spec/commands.md: the words the user types, the roles behind each and the options each accepts.
import type { Doc } from "./frontmatter";
import { Check } from "./check";
import type { Role, Vocab } from "./spec";

export type Option = { name: string; takes: string; about: string };
export type Command = {
  name: string;
  about: string;
  example: string;
  roles: string[];
  result: string;
  many: boolean;
  options: string[];
};

function loadOptions(c: Check, d: Record<string, unknown>): Map<string, Option> {
  const takes = (c.list(d, "takes") ?? []).filter((t): t is string => typeof t === "string");
  const out = new Map<string, Option>();
  for (const [name, v] of Object.entries(c.map(d, "options") ?? {})) {
    const oc = new Check(`${c.file}: options.${name}`);
    const o = (v ?? {}) as Record<string, unknown>;
    const opt = { name, takes: oc.oneOf(o, "takes", takes) ?? "", about: oc.text(o, "about") ?? "" };
    c.errors.push(...oc.errors);
    out.set(name, opt);
  }
  return out;
}

export type Commands = { commands: Map<string, Command>; options: Map<string, Option> };

export function loadCommands(doc: Doc, vocab: Vocab, roles: Map<string, Role>): { value: Commands; errors: string[] } {
  const c = new Check(doc.file);
  const options = loadOptions(c, doc.data);
  const out = new Map<string, Command>();
  for (const [name, v] of Object.entries(c.map(doc.data, "commands") ?? {})) {
    const cc = new Check(`${doc.file}: commands.${name}`);
    const d = (v ?? {}) as Record<string, unknown>;
    const cmd: Command = {
      name,
      about: cc.text(d, "about") ?? "",
      example: cc.text(d, "example") ?? "",
      roles: cc.names(d, "roles", roles.keys()),
      result: cc.oneOf(d, "result", vocab.results) ?? "",
      many: cc.flag(d, "many") ?? false,
      options: cc.names(d, "options", options.keys()),
    };
    if (!cmd.roles.length) cc.fail("roles", "must name at least one role");
    if (cmd.example && !cmd.example.startsWith(`${name} `)) cc.fail("example", `must start with '${name} '`);
    c.errors.push(...cc.errors);
    out.set(name, cmd);
  }
  return { value: { commands: out, options }, errors: c.errors };
}

