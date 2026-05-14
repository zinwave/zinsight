import type { GitHeatmap } from '../types';
/**
 * Build a per-file change-frequency heatmap from git log.
 *
 * Pure local git read, no network. Returns `available: false` when the root is
 * not a git repository or git is not on PATH.
 */
export declare function detectGitHeatmap(rootDir: string, knownFiles: string[], windowDays?: number): GitHeatmap;
//# sourceMappingURL=git-heatmap.d.ts.map