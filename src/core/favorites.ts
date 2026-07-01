import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const QORE_DIR = join(homedir(), ".qore");
const FAV_FILE = join(QORE_DIR, "favorites.json");

export function loadFavorites(): string[] {
  try {
    if (!existsSync(FAV_FILE)) return [];
    const data = readFileSync(FAV_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFavorites(favorites: string[]): void {
  try {
    if (!existsSync(QORE_DIR)) mkdirSync(QORE_DIR, { recursive: true });
    writeFileSync(FAV_FILE, JSON.stringify(favorites, null, 2), "utf-8");
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
