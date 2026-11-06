export interface Measure {
  runtime: { esmMin: number; esmGzip: number; iifeMin: number; iifeGzip: number };
  kit: { json: number; esmMin: number; iifeMin: number; esmGzip: number };
  parts: Record<string, number>;
}
export const BUDGET: { runtimeMin: number; runtimeGzip: number; kitMin: number };
export function measure(): Promise<Measure>;
export function checks(m: Measure): [label: string, actual: number, limit: number][];
