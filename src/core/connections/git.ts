import type { ConnectionConfig } from "../vault/types.js";
import type { ConnectionManager } from "./manager.js";

export interface GitFileStatus {
  index: string;
  working: string;
  path: string;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommit: string;
  lastCommitDate: string;
  ahead: number;
  behind: number;
  upstream?: string;
  commitCount: number;
}

export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  refs: string;
  graph: string;
}

export interface GitRemoteInfo {
  name: string;
  url: string;
  type: "fetch" | "push";
}

export interface GitTagInfo {
  name: string;
  hash: string;
  date: string;
  message: string;
}

export interface GitBlameLine {
  hash: string;
  author: string;
  date: string;
  lineNumber: number;
  content: string;
}

export interface GitDiffResult {
  files: GitDiffFile[];
  raw: string;
}

export interface GitDiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

export interface GitDiffLine {
  type: "add" | "del" | "context";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface GitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function parseShortHash(hash: string): string {
  return hash.substring(0, 7);
}

function parseRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}

export class GitManager implements ConnectionManager {
  lastError: string | null = null;

  private getRepoPath(config: ConnectionConfig): string {
    return config.host || config.extra?.repoPath || "";
  }

  private async execGit(config: ConnectionConfig, args: string[]): Promise<GitResult> {
    const repoPath = this.getRepoPath(config);
    const fullArgs = ["-C", repoPath, ...args];

    try {
      const proc = Bun.spawn({
        cmd: ["git", ...fullArgs],
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;

      return { exitCode, stdout, stderr };
    } catch (err) {
      return {
        exitCode: -1,
        stdout: "",
        stderr: (err as Error).message,
      };
    }
  }

  async testConnection(config: ConnectionConfig): Promise<boolean> {
    try {
      this.lastError = null;
      const result = await this.execGit(config, ["rev-parse", "--is-inside-work-tree"]);
      if (result.exitCode !== 0) {
        this.lastError = result.stderr.trim() || "Not a git repository";
        return false;
      }
      return result.stdout.trim() === "true";
    } catch (err) {
      this.lastError = (err as Error).message;
      return false;
    }
  }

  async getInfo(config: ConnectionConfig): Promise<Record<string, string>> {
    const info: Record<string, string> = {};

    const branch = await this.execGit(config, ["branch", "--show-current"]);
    if (branch.stdout.trim()) info["branch"] = branch.stdout.trim();

    const remote = await this.execGit(config, ["remote"]);
    if (remote.stdout.trim()) info["remotes"] = remote.stdout.trim().split("\n").join(", ");

    const lastCommit = await this.execGit(config, ["log", "-1", "--format=%h %s (%cr)"]);
    if (lastCommit.stdout.trim()) info["lastCommit"] = lastCommit.stdout.trim();

    const status = await this.getStatus(config);
    const dirtyCount = status.filter(f => f.index !== " " || f.working !== " ").length;
    info["dirtyFiles"] = String(dirtyCount);

    const aheadBehind = await this.getAheadBehind(config);
    info["ahead"] = String(aheadBehind.ahead);
    info["behind"] = String(aheadBehind.behind);

    return info;
  }

  async getStatus(config: ConnectionConfig): Promise<GitFileStatus[]> {
    const result = await this.execGit(config, ["status", "--porcelain=v1"]);
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split("\n")
      .filter((line) => line.length >= 3)
      .map((line) => ({
        index: line[0],
        working: line[1],
        path: line.substring(3),
      }));
  }

  async getDiff(config: ConnectionConfig, opts?: { staged?: boolean; branch1?: string; branch2?: string; file?: string }): Promise<GitDiffResult> {
    const args = ["diff"];
    if (opts?.staged) args.push("--staged");
    if (opts?.branch1 && opts?.branch2) {
      args.length = 1;
      args.push(`${opts.branch1}..${opts.branch2}`);
    }
    if (opts?.file) args.push("--", opts.file);

    const result = await this.execGit(config, args);
    return this.parseDiff(result.stdout);
  }

  private parseDiff(raw: string): GitDiffResult {
    const files: GitDiffFile[] = [];
    const lines = raw.split("\n");
    let currentFile: GitDiffFile | null = null;
    let currentHunk: GitDiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith("diff --git")) {
        if (currentFile) files.push(currentFile);
        const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
        currentFile = {
          path: match ? match[2] : line,
          additions: 0,
          deletions: 0,
          hunks: [],
        };
        currentHunk = null;
      } else if (line.startsWith("@@")) {
        if (currentFile) {
          const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          oldLine = match ? parseInt(match[1]) : 0;
          newLine = match ? parseInt(match[2]) : 0;
          currentHunk = { header: line, lines: [] };
          currentFile.hunks.push(currentHunk);
        }
      } else if (currentHunk && currentFile) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentHunk.lines.push({ type: "add", content: line.substring(1), newLine: newLine++ });
          currentFile.additions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentHunk.lines.push({ type: "del", content: line.substring(1), oldLine: oldLine++ });
          currentFile.deletions++;
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({ type: "context", content: line.substring(1), oldLine: oldLine++, newLine: newLine++ });
        }
      }
    }
    if (currentFile) files.push(currentFile);

    return { files, raw };
  }

  async getBranches(config: ConnectionConfig): Promise<GitBranchInfo[]> {
    const result = await this.execGit(config, [
      "for-each-ref",
      "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso)|%(upstream:short)|%(HEAD)",
      "refs/heads/",
    ]);
    if (result.exitCode !== 0) return [];

    const currentBranch = await this.execGit(config, ["branch", "--show-current"]);
    const current = currentBranch.stdout.trim();

    const branches: GitBranchInfo[] = [];

    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const [name, lastCommit, date, upstream, isHead] = line.split("|");
      const aheadBehind = upstream ? await this.getAheadBehindForBranch(config, name, upstream) : { ahead: 0, behind: 0 };
      const countResult = await this.execGit(config, ["rev-list", "--count", name]);
      branches.push({
        name,
        isCurrent: name === current,
        isRemote: false,
        lastCommit,
        lastCommitDate: parseRelativeDate(date),
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        upstream: upstream || undefined,
        commitCount: parseInt(countResult.stdout.trim()) || 0,
      });
    }

    const remoteResult = await this.execGit(config, [
      "for-each-ref",
      "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso)",
      "refs/remotes/",
    ]);
    if (remoteResult.exitCode === 0) {
      for (const line of remoteResult.stdout.split("\n").filter(Boolean)) {
        const [name, lastCommit, date] = line.split("|");
        const countResult = await this.execGit(config, ["rev-list", "--count", name]);
        branches.push({
          name,
          isCurrent: false,
          isRemote: true,
          lastCommit,
          lastCommitDate: parseRelativeDate(date),
          ahead: 0,
          behind: 0,
          commitCount: parseInt(countResult.stdout.trim()) || 0,
        });
      }
    }

    return branches;
  }

  private async getAheadBehindForBranch(config: ConnectionConfig, branch: string, upstream: string): Promise<{ ahead: number; behind: number }> {
    const result = await this.execGit(config, ["rev-list", "--left-right", "--count", `${upstream}...${branch}`]);
    if (result.exitCode !== 0) return { ahead: 0, behind: 0 };
    const parts = result.stdout.trim().split(/\s+/);
    return { behind: parseInt(parts[0]) || 0, ahead: parseInt(parts[1]) || 0 };
  }

  async getAheadBehind(config: ConnectionConfig): Promise<{ ahead: number; behind: number }> {
    const branch = await this.execGit(config, ["branch", "--show-current"]);
    const current = branch.stdout.trim();
    if (!current) return { ahead: 0, behind: 0 };

    const upstreamResult = await this.execGit(config, ["rev-parse", "--abbrev-ref", `${current}@{upstream}`]);
    if (upstreamResult.exitCode !== 0) return { ahead: 0, behind: 0 };

    return this.getAheadBehindForBranch(config, current, upstreamResult.stdout.trim());
  }

  async getLog(config: ConnectionConfig, opts?: { limit?: number; branch?: string }): Promise<GitLogEntry[]> {
    const limit = opts?.limit ?? 50;
    const ref = opts?.branch ?? "HEAD";
    const args = [
      "log",
      `--max-count=${limit}`,
      "--format=%H|%h|%an|%cr|%s|%D",
      "--graph",
      "--no-color",
      ref,
    ];

    const result = await this.execGit(config, args);
    if (result.exitCode !== 0) return [];

    const entries: GitLogEntry[] = [];

    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue;

      if (line.startsWith("*") || line.startsWith("|") || line.startsWith("/") || line.startsWith("\\") || line.startsWith("-")) {
        const graphPart = line.match(/^[*|\/\\\- ]+/);
        const rest = line.substring(graphPart ? graphPart[0].length : 0).trim();
        if (rest && rest.includes("|")) {
          const [hash, shortHash, author, date, message, refs] = rest.split("|");
          entries.push({
            hash,
            shortHash,
            author,
            date: parseRelativeDate(date),
            message,
            refs,
            graph: graphPart ? graphPart[0] : "",
          });
        } else if (rest) {
          if (entries.length > 0) {
            entries[entries.length - 1].graph += graphPart ? graphPart[0] : "";
          }
        }
      } else if (line.includes("|")) {
        const [hash, shortHash, author, date, message, refs] = line.split("|");
        entries.push({
          hash,
          shortHash,
          author,
          date: parseRelativeDate(date),
          message,
          refs,
          graph: "",
        });
      }
    }

    return entries;
  }

  async getRemotes(config: ConnectionConfig): Promise<GitRemoteInfo[]> {
    const result = await this.execGit(config, ["remote", "-v"]);
    if (result.exitCode !== 0) return [];

    const remotes: GitRemoteInfo[] = [];
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)/);
      if (match) {
        remotes.push({ name: match[1], url: match[2], type: match[3] as "fetch" | "push" });
      }
    }
    return remotes;
  }

  async getTags(config: ConnectionConfig): Promise<GitTagInfo[]> {
    const result = await this.execGit(config, [
      "for-each-ref",
      "--format=%(refname:short)|%(objectname:short)|%(creatordate:iso)|%(contents:subject)",
      "refs/tags/",
    ]);
    if (result.exitCode !== 0) return [];

    return result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, hash, date, message] = line.split("|");
        return { name, hash, date: parseRelativeDate(date), message };
      });
  }

  async stage(config: ConnectionConfig, files?: string[]): Promise<GitResult> {
    const args = files && files.length > 0 ? ["add", ...files] : ["add", "-A"];
    return this.execGit(config, args);
  }

  async unstage(config: ConnectionConfig, files?: string[]): Promise<GitResult> {
    const args = files && files.length > 0 ? ["reset", "HEAD", ...files] : ["reset", "HEAD"];
    return this.execGit(config, args);
  }

  async commit(config: ConnectionConfig, message: string): Promise<GitResult> {
    return this.execGit(config, ["commit", "-m", message]);
  }

  async checkout(config: ConnectionConfig, branch: string): Promise<GitResult> {
    return this.execGit(config, ["checkout", branch]);
  }

  async createBranch(config: ConnectionConfig, name: string): Promise<GitResult> {
    return this.execGit(config, ["checkout", "-b", name]);
  }

  async deleteBranch(config: ConnectionConfig, name: string): Promise<GitResult> {
    return this.execGit(config, ["branch", "-d", name]);
  }

  async merge(config: ConnectionConfig, branch: string): Promise<GitResult> {
    return this.execGit(config, ["merge", branch]);
  }

  async rebase(config: ConnectionConfig, branch: string): Promise<GitResult> {
    return this.execGit(config, ["rebase", branch]);
  }

  async fetch(config: ConnectionConfig, remote?: string): Promise<GitResult> {
    const args = ["fetch"];
    if (remote) args.push(remote);
    return this.execGit(config, args);
  }

  async pull(config: ConnectionConfig, remote?: string, branch?: string): Promise<GitResult> {
    const args = ["pull"];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    return this.execGit(config, args);
  }

  async push(config: ConnectionConfig, remote?: string, branch?: string): Promise<GitResult> {
    const args = ["push"];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    return this.execGit(config, args);
  }

  async cherryPick(config: ConnectionConfig, hash: string): Promise<GitResult> {
    return this.execGit(config, ["cherry-pick", hash]);
  }

  async revert(config: ConnectionConfig, hash: string): Promise<GitResult> {
    return this.execGit(config, ["revert", "--no-edit", hash]);
  }

  async amend(config: ConnectionConfig, message?: string): Promise<GitResult> {
    const args = ["commit", "--amend"];
    if (message) {
      args.push("-m", message);
    } else {
      args.push("--no-edit");
    }
    return this.execGit(config, args);
  }

  async blame(config: ConnectionConfig, file: string): Promise<GitBlameLine[]> {
    const result = await this.execGit(config, ["blame", "--porcelain", file]);
    if (result.exitCode !== 0) return [];

    const lines: GitBlameLine[] = [];
    const lines_by_hash: Record<string, { author: string; date: string }> = {};

    for (const line of result.stdout.split("\n")) {
      const match = line.match(/^([0-9a-f]+)\s+(\d+)\s+(\d+)\s+(\d+)?/);
      if (match) {
        const hash = match[1];
        const lineNumber = parseInt(match[3]);
        if (!lines_by_hash[hash]) {
          lines_by_hash[hash] = { author: "", date: "" };
        }
        lines.push({ hash, author: "", date: "", lineNumber, content: "" });
      } else if (line.startsWith("author ") && lines.length > 0) {
        const lastHash = lines[lines.length - 1].hash;
        if (lines_by_hash[lastHash]) {
          lines_by_hash[lastHash].author = line.substring(7);
        }
      } else if (line.startsWith("author-time ") && lines.length > 0) {
        const lastHash = lines[lines.length - 1].hash;
        if (lines_by_hash[lastHash]) {
          lines_by_hash[lastHash].date = parseRelativeDate(new Date(parseInt(line.substring(12)) * 1000).toISOString());
        }
      } else if (line.startsWith("\t") && lines.length > 0) {
        lines[lines.length - 1].content = line.substring(1);
      }
    }

    for (const line of lines) {
      const meta = lines_by_hash[line.hash];
      if (meta) {
        line.author = meta.author;
        line.date = meta.date;
      }
    }

    return lines;
  }

  async createTag(config: ConnectionConfig, name: string, message?: string): Promise<GitResult> {
    const args = ["tag", "-a", name];
    if (message) args.push("-m", message);
    return this.execGit(config, args);
  }

  async setUpstream(config: ConnectionConfig, remote: string, branch: string): Promise<GitResult> {
    return this.execGit(config, ["branch", "--set-upstream-to", `${remote}/${branch}`]);
  }

  async addRemote(config: ConnectionConfig, name: string, url: string): Promise<GitResult> {
    return this.execGit(config, ["remote", "add", name, url]);
  }

  async exec(config: ConnectionConfig, args: string[]): Promise<GitResult> {
    return this.execGit(config, args);
  }

  async getLogs(config: ConnectionConfig): Promise<string[]> {
    const result = await this.execGit(config, ["log", "--oneline", "-20"]);
    if (result.exitCode !== 0) return [];
    return result.stdout.split("\n").filter(Boolean);
  }
}
