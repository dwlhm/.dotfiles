// Running git, gh and checks: an exit code always, never a thrown spawn error, never a hang.
export type Exec = (cmd: string, args: string[], cwd: string, timeoutSeconds?: number) => Promise<{ code: number; out: string; err: string }>;

/** How long one git or gh call may take before it is killed (a stalled network, a lock). */
export const EXEC_SECONDS = 60;

/** A missing program or folder is an exit code (127), like a shell's, not a thrown spawn error. */
export const exec: Exec = async (cmd, args, cwd, timeoutSeconds = EXEC_SECONDS) => {
  try {
    const p = Bun.spawn([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe", timeout: timeoutSeconds * 1000 });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (p.signalCode === "SIGTERM") return { code: 124, out, err: `${cmd} timed out after ${timeoutSeconds}s` };
    return { code, out, err: err.trim() };
  } catch (e) {
    return { code: 127, out: "", err: `${cmd}: ${(e as Error).message}` };
  }
};

