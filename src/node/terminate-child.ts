import type { ChildProcess } from "node:child_process";

const terminationGraceMs = 500;

export async function terminateChild(child: ChildProcess, closed: Promise<number>): Promise<void> {
  child.kill("SIGTERM");
  let timer: NodeJS.Timeout | undefined;
  const exited = await Promise.race([
    closed.then(
      () => true,
      () => true,
    ),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), terminationGraceMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  if (!exited) {
    child.kill("SIGKILL");
    try {
      await closed;
    } catch {
      // Spawn errors are secondary to the caller's original failure.
    }
  }
}
