import { useEffect, useRef } from "react";

let active = false;

function injectKey(data: string) {
  try {
    process.stdin.emit("data", Buffer.from(data));
  } catch {
    // stdin emit not supported — silently ignored
  }
}

function writeEsc(seq: string) {
  if (process.stdout.isTTY) {
    try { process.stdout.write(seq); } catch {}
  }
}

export function useMouse() {
  const bufRef = useRef("");

  useEffect(() => {
    if (active || !process.stdin.isTTY) return;
    active = true;

    const cleanup = () => {
      writeEsc("\x1b[?1000l\x1b[?1002l\x1b[?1006l");
    };

    // Enable SGR mouse mode: basic tracking + button-event + extended coords
    writeEsc("\x1b[?1000h\x1b[?1002h\x1b[?1006h");

    // Disable on process exit (in case React cleanup doesn't run)
    process.on("exit", cleanup);

    const onData = (data: Buffer) => {
      const chunk = data.toString("utf-8");
      bufRef.current += chunk;

      // SGR mouse: ESC [ < {btn} ; {col} ; {row} {M|m}
      const re = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bufRef.current)) !== null) {
        const btn = parseInt(m[1], 10);
        const type = m[4];

        if (btn >= 64) {
          // Wheel: 64=up 65=down
          if (btn === 64) injectKey("\x1b[A");
          else if (btn === 65) injectKey("\x1b[B");
        } else if (type === "M") {
          // Press: 0=left 2=right
          if (btn === 0) injectKey("\r");
          else if (btn === 2) injectKey("\x1b");
        }
      }

      bufRef.current = bufRef.current.replace(re, "");
      if (bufRef.current.length > 200) {
        bufRef.current = bufRef.current.slice(-200);
      }
    };

    process.stdin.on("data", onData);

    return () => {
      cleanup();
      process.removeListener("exit", cleanup);
      process.stdin.removeListener("data", onData);
      active = false;
    };
  }, []);
}
