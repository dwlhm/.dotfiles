// Field checks that collect every problem in one pass, each phrased as `file: field: what is wrong`.

export class Check {
  constructor(
    readonly file: string,
    readonly errors: string[] = [],
  ) {}

  fail(field: string, msg: string): undefined {
    this.errors.push(`${this.file}: ${field}: ${msg}`);
    return undefined;
  }

  text(obj: Record<string, unknown>, field: string, optional = false): string | undefined {
    const v = obj[field];
    if (v === undefined && optional) return undefined;
    if (typeof v !== "string" || v.trim() === "") return this.fail(field, "must be a non-empty text");
    return v;
  }

  int(obj: Record<string, unknown>, field: string, min: number): number | undefined {
    const v = obj[field];
    if (!Number.isInteger(v) || (v as number) < min) return this.fail(field, `must be a whole number ≥ ${min}`);
    return v as number;
  }

  flag(obj: Record<string, unknown>, field: string): boolean | undefined {
    const v = obj[field] ?? false;
    if (typeof v !== "boolean") return this.fail(field, "must be true or false");
    return v;
  }

  map(obj: Record<string, unknown>, field: string): Record<string, unknown> | undefined {
    const v = obj[field];
    if (v === null || typeof v !== "object" || Array.isArray(v)) return this.fail(field, "must be a mapping");
    return v as Record<string, unknown>;
  }

  list(obj: Record<string, unknown>, field: string, optional = false): unknown[] | undefined {
    const v = obj[field];
    if (v === undefined && optional) return [];
    if (!Array.isArray(v)) return this.fail(field, "must be a list");
    return v;
  }

  /** A list of names, each one of `known`; duplicates are an error. */
  names(obj: Record<string, unknown>, field: string, known: Iterable<string>, optional = false): string[] {
    const list = this.list(obj, field, optional) ?? [];
    const allowed = new Set(known);
    const seen = new Set<string>();
    for (const v of list) {
      if (typeof v !== "string") this.fail(field, `${JSON.stringify(v)} is not a name`);
      else if (!allowed.has(v)) this.fail(field, `unknown '${v}' (known: ${[...allowed].join(", ")})`);
      else if (seen.has(v)) this.fail(field, `'${v}' is listed twice`);
      else seen.add(v);
    }
    return [...seen];
  }

  /** A list of free-form lowercase names (a-z, _), each listed once. */
  words(obj: Record<string, unknown>, field: string): string[] {
    const out: string[] = [];
    for (const v of this.list(obj, field) ?? []) {
      if (typeof v !== "string" || !/^[a-z_]+$/.test(v)) this.fail(field, `${JSON.stringify(v)} must be a name of a-z and _`);
      else if (out.includes(v)) this.fail(field, `'${v}' is listed twice`);
      else out.push(v);
    }
    return out;
  }

  oneOf(obj: Record<string, unknown>, field: string, known: Iterable<string>): string | undefined {
    const v = this.text(obj, field);
    const allowed = [...known];
    if (v !== undefined && !allowed.includes(v)) return this.fail(field, `unknown '${v}' (known: ${allowed.join(", ")})`);
    return v;
  }
}
