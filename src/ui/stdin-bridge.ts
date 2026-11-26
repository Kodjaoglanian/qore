import { EventEmitter } from "node:events";

export interface RawStdinLike {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => void;
  resume?: () => unknown;
  pause?: () => unknown;
  ref?: () => unknown;
  unref?: () => unknown;
  on: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
  off?: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
}

/**
 * On Windows (especially in Bun compiled binaries under ConPTY / PowerShell / cmd.exe),
 * Ink 5 listens for `readable` + `stdin.read()`, while Bun's Windows TTY stream delivers
 * keypresses reliably via flowing `data` events (and calling `stdin.resume()` after
 * `addListener('readable')` can swallow chunks or fail to emit `readable`).
 *
 * This bridge reads from the underlying stdin via `data` events, buffers chunks in a
 * lightweight EventEmitter queue, and emits `readable` synchronously for Ink's
 * `while ((chunk = stdin.read()) !== null)` loop, while safely guarding
 * `setRawMode`, `ref`, and `unref`.
 */
export function createWindowsStdinBridge(
  source: RawStdinLike = process.stdin as unknown as RawStdinLike,
): NodeJS.ReadStream {
  const emitter = new EventEmitter();
  const queue: (string | Buffer)[] = [];
  let encoding: BufferEncoding | null = null;

  const bridge = Object.assign(emitter, {
    isTTY: true,
    readable: true,

    setEncoding(enc: BufferEncoding) {
      encoding = enc;
      return bridge;
    },

    read(): string | Buffer | null {
      if (queue.length === 0) return null;
      return queue.shift() ?? null;
    },

    setRawMode(mode: boolean) {
      try {
        if (typeof source.setRawMode === "function") {
          source.setRawMode(mode);
        }
      } catch {
        // Never crash if terminal emulator rejects raw mode (e.g., Mintty/Git Bash)
      }
      return bridge;
    },

    ref() {
      try {
        if (typeof source.ref === "function") source.ref();
      } catch {}
      return bridge;
    },

    unref() {
      try {
        if (typeof source.unref === "function") source.unref();
      } catch {}
      return bridge;
    },

    resume() {
      try {
        if (typeof source.resume === "function") source.resume();
      } catch {}
      return bridge;
    },

    pause() {
      try {
        if (typeof source.pause === "function") source.pause();
      } catch {}
      return bridge;
    },
  });

  const onData = (chunk: Buffer | string) => {
    const value =
      typeof chunk === "string"
        ? chunk
        : encoding
          ? chunk.toString(encoding)
          : chunk;
    queue.push(value);
    bridge.emit("readable");
  };

  source.on("data", onData);

  // Immediately enable raw mode and start flowing on source for Windows console input
  try {
    if (typeof source.setRawMode === "function") source.setRawMode(true);
    if (typeof source.resume === "function") source.resume();
  } catch {}

  return bridge as unknown as NodeJS.ReadStream;
}
