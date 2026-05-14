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
exports.detectEntryPoints = detectEntryPoints;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const COMMON_ENTRY_NAMES = [
    'src/index',
    'src/main',
    'src/app',
    'src/server',
    'index',
    'main',
    'app',
    'server',
];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
function detectEntryPoints(rootDir, knownFiles) {
    const entries = [];
    const knownSet = new Set(knownFiles);
    // Read package.json
    const pkgPath = path.join(rootDir, 'package.json');
    let pkg = {};
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    }
    catch {
        // no package.json
    }
    // main field
    if (pkg.main) {
        const resolved = resolveEntry(rootDir, pkg.main, knownSet);
        if (resolved)
            entries.push({ label: 'main', filePath: resolved });
    }
    // module field
    if (pkg.module) {
        const resolved = resolveEntry(rootDir, pkg.module, knownSet);
        if (resolved)
            entries.push({ label: 'module', filePath: resolved });
    }
    // bin field
    if (pkg.bin) {
        if (typeof pkg.bin === 'string') {
            const resolved = resolveEntry(rootDir, pkg.bin, knownSet);
            if (resolved)
                entries.push({ label: `bin:${pkg.name || 'cli'}`, filePath: resolved });
        }
        else if (typeof pkg.bin === 'object') {
            for (const [name, binPath] of Object.entries(pkg.bin)) {
                const resolved = resolveEntry(rootDir, binPath, knownSet);
                if (resolved)
                    entries.push({ label: `bin:${name}`, filePath: resolved });
            }
        }
    }
    // exports field (simple walk)
    if (pkg.exports) {
        walkExports(pkg.exports, rootDir, knownSet, entries);
    }
    // Common entry point filenames
    const existingPaths = new Set(entries.map(e => e.filePath));
    for (const base of COMMON_ENTRY_NAMES) {
        for (const ext of EXTENSIONS) {
            const candidate = base + ext;
            if (knownSet.has(candidate) && !existingPaths.has(candidate)) {
                entries.push({ label: 'entry', filePath: candidate });
                existingPaths.add(candidate);
                break;
            }
        }
    }
    // Framework detection
    if (knownFiles.some(f => f.startsWith('src/pages/') || f.startsWith('pages/'))) {
        entries.push({ label: 'framework:pages-router', filePath: 'src/pages/' });
    }
    if (knownFiles.some(f => f.startsWith('src/app/') && f.includes('layout'))) {
        entries.push({ label: 'framework:app-router', filePath: 'src/app/' });
    }
    if (knownFiles.some(f => f.startsWith('src/routes/'))) {
        entries.push({ label: 'framework:file-routes', filePath: 'src/routes/' });
    }
    return entries;
}
function resolveEntry(rootDir, raw, knownSet) {
    // Normalize the path
    const normalized = raw.startsWith('./') ? raw.slice(2) : raw;
    if (knownSet.has(normalized))
        return normalized;
    // Try with extensions
    for (const ext of EXTENSIONS) {
        if (knownSet.has(normalized + ext))
            return normalized + ext;
    }
    // Try as directory index
    for (const ext of EXTENSIONS) {
        const indexPath = path.join(normalized, `index${ext}`);
        if (knownSet.has(indexPath))
            return indexPath;
    }
    return null;
}
function walkExports(obj, rootDir, knownSet, entries, prefix = 'exports') {
    if (typeof obj === 'string') {
        const resolved = resolveEntry(rootDir, obj, knownSet);
        if (resolved)
            entries.push({ label: prefix, filePath: resolved });
        return;
    }
    if (typeof obj === 'object' && obj !== null) {
        for (const [key, val] of Object.entries(obj)) {
            walkExports(val, rootDir, knownSet, entries, `${prefix}:${key}`);
        }
    }
}
//# sourceMappingURL=entry-points.js.map