import { PassThrough } from "node:stream";
import { dispatchMouse } from "./mouseBus.js";

export function createMouseStdin(): NodeJS.ReadStream {
  const stdin = new PassThrough();

  // Mirror TTY properties/methods that Ink expects from stdin
  Object.defineProperty(stdin, "isTTY", { get: () => process.stdin.isTTY });
  (stdin as any).setRawMode = (mode: boolean) => {
    if (typeof (process.stdin as any).setRawMode === "function") {
      return (process.stdin as any).setRawMode(mode);
    }
  };

  let buf = "";
  let sgrTimer: ReturnType<typeof setTimeout> | null = null;

  const enableMouse = () => {
    if (process.stdout.isTTY) {
      try { process.stdout.write("\x1b[?1000h\x1b[?1002h\x1b[?1006h"); } catch {}
    }
  };

  const disableMouse = () => {
    if (process.stdout.isTTY) {
      try { process.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1006l"); } catch {}
    }
  };

  const injectKey = (key: string) => {
    stdin.push(Buffer.from(key));
  };

  const flushIncomplete = () => {
    sgrTimer = null;
    if (buf) {
      stdin.push(buf);
      buf = "";
    }
  };

  const onData = (data: Buffer) => {
    if (sgrTimer) {
      clearTimeout(sgrTimer);
      sgrTimer = null;
    }

    buf += data.toString("utf-8");

    while (true) {
      const sgrStart = buf.indexOf("\x1b[<");
      if (sgrStart === -1) {
        if (buf) {
          stdin.push(buf);
          buf = "";
        }
        return;
      }

      if (sgrStart > 0) {
        stdin.push(buf.slice(0, sgrStart));
        buf = buf.slice(sgrStart);
      }

      const sgrRegex = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
      const match = buf.match(sgrRegex);
      if (!match) {
        // Incomplete SGR mouse sequence — wait a few ms for the rest
        sgrTimer = setTimeout(flushIncomplete, 20);
        return;
      }

      const btn = parseInt(match[1], 10);
      const x = parseInt(match[2], 10);
      const y = parseInt(match[3], 10);
      const type = match[4];

      if (btn >= 64) {
        // Wheel: 64=up 65=down → inject arrow keys
        if (btn === 64) injectKey("\x1b[A");
        else if (btn === 65) injectKey("\x1b[B");
      } else if (type === "M") {
        // Press: 0=left 2=right → dispatch with coordinates
        if (btn === 0) dispatchMouse({ type: "click", x, y });
        else if (btn === 2) dispatchMouse({ type: "rightClick", x, y });
      }

      buf = buf.slice(match[0].length);
    }
  };

  enableMouse();
  process.stdin.on("data", onData);

  const cleanup = () => {
    disableMouse();
    if (sgrTimer) clearTimeout(sgrTimer);
    process.stdin.removeListener("data", onData);
  };

  process.on("exit", cleanup);

  return stdin as unknown as NodeJS.ReadStream;
}
