import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";

const QORE_DIR = join(homedir(), ".qore");
const SNIPPETS_FILE = join(QORE_DIR, "snippets.json");

export interface SnippetCommand {
  connId: string;
  connName: string;
  command: string;
}

export interface Snippet {
  id: string;
  name: string;
  commands: SnippetCommand[];
  createdAt: string;
}

export function loadSnippets(): Snippet[] {
  try {
    if (!existsSync(SNIPPETS_FILE)) return [];
    const data = readFileSync(SNIPPETS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnippets(snippets: Snippet[]): void {
  try {
    if (!existsSync(QORE_DIR)) mkdirSync(QORE_DIR, { recursive: true });
    writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2), "utf-8");
  } catch {}
}

export function createSnippet(name: string, commands: SnippetCommand[]): Snippet {
  const snippets = loadSnippets();
  const snippet: Snippet = {
    id: randomUUID(),
    name,
    commands,
    createdAt: new Date().toISOString(),
  };
  snippets.push(snippet);
  saveSnippets(snippets);
  return snippet;
}

export function removeSnippet(id: string): Snippet[] {
  const snippets = loadSnippets().filter((s) => s.id !== id);
  saveSnippets(snippets);
  return snippets;
}

export function getSnippetByName(name: string): Snippet | undefined {
  return loadSnippets().find((s) => s.name === name);
}
