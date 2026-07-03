import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

function qoreDir(): string {
  return process.env.QORE_HOME ?? join(homedir(), ".qore");
}
function favFile(): string { return join(qoreDir(), "favorites.json"); }

export function loadFavorites(): string[] {
  try {
    if (!existsSync(favFile())) return [];
    const data = readFileSync(favFile(), "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: string[]): void {
  try {
    const dir = qoreDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(favFile(), JSON.stringify(favorites, null, 2), "utf-8");
  } catch {}
}

export function addFavorite(cmd: string): string[] {
  const favs = loadFavorites();
  if (!favs.includes(cmd)) {
    favs.push(cmd);
    saveFavorites(favs);
  }
  return favs;
}

export function removeFavorite(cmd: string): string[] {
  const favs = loadFavorites().filter((f) => f !== cmd);
  saveFavorites(favs);
  return favs;
}
