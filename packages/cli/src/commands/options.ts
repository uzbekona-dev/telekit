/** Shared by every command: `cwd` defaults to `process.cwd()` — tests point it at a temp project instead. */
export interface CommandOptions {
  cwd?: string;
}
