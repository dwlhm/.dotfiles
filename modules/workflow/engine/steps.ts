// Steps nest (a step split into sub-steps). One definition of walking them and of when a step,
// a split one included, has ended and how.
import type { Step } from "./records";

export const ENDED = ["done", "failed", "stopped"];

/** Every step, depth first: a split step, then its sub-steps. */
export const flat = (steps: Step[]): Step[] => steps.flatMap((s) => [s, ...flat(s.steps)]);

/** How a step ended, or null while it has not. A split step ends with its sub-steps: done when
 *  they all are, failed when one failed or stopped. */
export function ended(step: Step): string | null {
  if (step.status !== "split") return ENDED.includes(step.status) ? step.status : null;
  const kids = step.steps.map(ended);
  if (kids.some((k) => k === null)) return null;
  return kids.every((k) => k === "done") ? "done" : "failed";
}

/** How deep a step id sits: `w12.2` is 1, `w12.2.1` is 2. */
export const depth = (id: string): number => id.split(".").length - 1;

/** The step with this id, at any depth. */
export const find = (steps: Step[], id: string): Step | undefined => flat(steps).find((s) => s.id === id);
