import { execFileSync } from 'child_process';
import * as path from 'path';
import type { GitHeatmap, GitChangeStat } from '../types';

const DEFAULT_WINDOW_DAYS = 180;

/**
 * Build a per-file change-frequency heatmap from git log.
 *
 * Pure local git read, no network. Returns `available: false` when the root is
 * not a git repository or git is not on PATH.
 */
export function detectGitHeatmap(
  rootDir: string,
  knownFiles: string[],
  windowDays: number = DEFAULT_WINDOW_DAYS,
): GitHeatmap {
  const empty: GitHeatmap = {
    available: false,
    windowDays,
    files: [],
  };

  // Quick reachability check: is this a git repo with at least one commit?
  if (!isGitRepo(rootDir)) return empty;

  const since = `${windowDays}.days.ago`;
  let raw: string;
  try {
    raw = execFileSync(
      'git',
      ['log', `--since=${since}`, '--name-only', '--pretty=format:|||%H|%ai|%an'],
      {
        cwd: rootDir,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024, // 64MB cap
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch {
    return empty;
  }

  // Filter to files we know about (avoids counting deleted files / generated assets)
  const known = new Set(knownFiles);

  type Acc = { count: number; authors: Set<string>; lastChanged: string | null };
  const acc = new Map<string, Acc>();

  let currentAuthor: string | null = null;
  let currentDate: string | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('|||')) {
      // commit metadata line: "|||<hash>|<iso-date>|<author>"
      const parts = line.slice(3).split('|');
      currentDate = parts[1] || null;
      currentAuthor = parts[2] || null;
      continue;
    }

    // file path line
    const fp = normalizePath(line);
    if (!known.has(fp)) continue;

    let entry = acc.get(fp);
    if (!entry) {
      entry = { count: 0, authors: new Set(), lastChanged: null };
      acc.set(fp, entry);
    }
    entry.count += 1;
    if (currentAuthor) entry.authors.add(currentAuthor);
    if (currentDate && (!entry.lastChanged || currentDate > entry.lastChanged)) {
      entry.lastChanged = currentDate;
    }
  }

  const files: GitChangeStat[] = [];
  for (const [fp, entry] of acc) {
    files.push({
      filePath: fp,
      changeCount: entry.count,
      authorCount: entry.authors.size,
      authors: [...entry.authors].sort(),
      lastChanged: entry.lastChanged,
    });
  }

  files.sort((a, b) => b.changeCount - a.changeCount);

  return {
    available: true,
    windowDays,
    files,
  };
}

function isGitRepo(rootDir: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function normalizePath(p: string): string {
  // git already returns POSIX paths; normalize for cross-platform safety.
  return p.split(path.sep).join('/');
}
