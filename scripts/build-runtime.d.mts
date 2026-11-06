export function buildRuntime(): Promise<{ esm: string; iife: string }>;
export function engineHash(): Promise<string>;
