import { useState, useEffect } from "react";

export function useTerminalSize() {
  const [width, setWidth] = useState(process.stdout.columns ?? 80);
  const [height, setHeight] = useState(process.stdout.rows ?? 24);

  useEffect(() => {
    function onResize() {
      setWidth(process.stdout.columns ?? 80);
      setHeight(process.stdout.rows ?? 24);
    }
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  return { width, height };
}
