// wf: the workflow engine's command line.
import { join } from "node:path";
import { loadSpec } from "./spec";
import { readDoc, SpecError } from "./frontmatter";
import { checkTask } from "./records";

const HELP = `wf — multi-agent workflow engine

  wf lint                 check the spec (roles, policy, commands, vocab)
  wf lint <record.md>…    check task records against the spec

Spec folder: $WF_SPEC, else the one shipped with wf.`;

export const specDir = (): string => process.env.WF_SPEC || join(import.meta.dir, "..", "spec");

function lint(files: string[]): number {
  const spec = loadSpec(specDir());
  const errors = files.flatMap((f) => {
    try {
      const doc = readDoc(f);
      return checkTask(f, doc.data, spec);
    } catch (e) {
      return [e instanceof SpecError ? e.message : `${f}: ${(e as Error).message}`];
    }
  });
  if (errors.length) {
    console.error(errors.join("\n"));
    return 1;
  }
  console.log(files.length ? `ok: ${files.length} record(s) valid` : `ok: spec valid (${spec.roles.size} roles, ${spec.commands.size} commands)`);
  return 0;
}

export function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "lint") return lint(rest);
    if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
      console.log(HELP);
      return cmd === undefined ? 2 : 0;
    }
    console.error(`wf: unknown command '${cmd}'\n\n${HELP}`);
    return 2;
  } catch (e) {
    if (!(e instanceof SpecError)) throw e;
    console.error(`wf: the spec is invalid:\n${e.message}`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
