"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGitHeatmap = detectGitHeatmap;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const DEFAULT_WINDOW_DAYS = 180;
/**
 * Build a per-file change-frequency heatmap from git log.
 *
 * Pure local git read, no network. Returns `available: false` when the root is
 * not a git repository or git is not on PATH.
 */
function detectGitHeatmap(rootDir, knownFiles, windowDays = DEFAULT_WINDOW_DAYS) {
    const empty = {
        available: false,
        windowDays,
        files: [],
    };
    // Quick reachability check: is this a git repo with at least one commit?
    if (!isGitRepo(rootDir))
        return empty;
    const since = `${windowDays}.days.ago`;
    let raw;
    try {
        raw = (0, child_process_1.execFileSync)('git', ['log', `--since=${since}`, '--name-only', '--pretty=format:|||%H|%ai|%an'], {
            cwd: rootDir,
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024, // 64MB cap
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    }
    catch {
        return empty;
    }
    // Filter to files we know about (avoids counting deleted files / generated assets)
    const known = new Set(knownFiles);
    const acc = new Map();
    let currentAuthor = null;
    let currentDate = null;
    for (const rawLine of raw.split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;
        if (line.startsWith('|||')) {
            // commit metadata line: "|||<hash>|<iso-date>|<author>"
            const parts = line.slice(3).split('|');
            currentDate = parts[1] || null;
            currentAuthor = parts[2] || null;
            continue;
        }
        // file path line
        const fp = normalizePath(line);
        if (!known.has(fp))
            continue;
        let entry = acc.get(fp);
        if (!entry) {
            entry = { count: 0, authors: new Set(), lastChanged: null };
            acc.set(fp, entry);
        }
        entry.count += 1;
        if (currentAuthor)
            entry.authors.add(currentAuthor);
        if (currentDate && (!entry.lastChanged || currentDate > entry.lastChanged)) {
            entry.lastChanged = currentDate;
        }
    }
    const files = [];
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
function isGitRepo(rootDir) {
    try {
        (0, child_process_1.execFileSync)('git', ['rev-parse', '--is-inside-work-tree'], {
            cwd: rootDir,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return true;
    }
    catch {
        return false;
    }
}
function normalizePath(p) {
    // git already returns POSIX paths; normalize for cross-platform safety.
    return p.split(path.sep).join('/');
}
//# sourceMappingURL=git-heatmap.js.map