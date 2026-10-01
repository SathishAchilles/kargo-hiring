// process.exit() can drop buffered stdout (pipes are asynchronous on macOS),
// so flush both streams first.
export async function exitAfterFlush(code: number): Promise<never> {
  await new Promise<void>((resolve) => process.stdout.write("", () => resolve()));
  await new Promise<void>((resolve) => process.stderr.write("", () => resolve()));
  process.exit(code);
}
