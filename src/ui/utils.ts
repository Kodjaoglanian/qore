const FRACTION_BLOCKS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"];

export function renderMeterString(pct: number, width: number = 14): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const exact = (clamped / 100) * width;
  const full = Math.floor(exact);
  const rem = exact - full;
  const fracIdx = Math.round(rem * 8);

  if (full >= width) {
    return "█".repeat(width);
  }
  const partial = fracIdx > 0 ? FRACTION_BLOCKS[fracIdx] : "";
  const emptyCount = Math.max(0, width - full - (partial ? 1 : 0));
  return "█".repeat(full) + partial + "░".repeat(emptyCount);
}

export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { match: true, score: 0 };
  const t = target.toLowerCase();

  const exactIdx = t.indexOf(q);
  if (exactIdx === 0) return { match: true, score: 100 };
  if (exactIdx > 0) return { match: true, score: 75 - exactIdx };

  let qi = 0;
  let consecutive = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += 5 + consecutive * 2;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? { match: true, score } : { match: false, score: 0 };
}
