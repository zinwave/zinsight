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
exports.detectDocs = detectDocs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const glob_1 = require("glob");
const DOC_PATTERNS = [
    'README.md', 'README.txt', 'README',
    'SECURITY.md', 'SECURITY.txt',
    'CONTRIBUTING.md', 'CONTRIBUTING.txt',
    'CHANGELOG.md', 'CHANGELOG.txt', 'CHANGES.md', 'HISTORY.md',
    'LICENSE.md', 'LICENSE.txt', 'LICENSE',
    'CODE_OF_CONDUCT.md',
    'ARCHITECTURE.md',
    'DEPLOYMENT.md', 'DEPLOY.md',
    'API.md', 'DEVELOPMENT.md',
    'docs/README.md', 'docs/*.md',
];
const TYPE_MAP = {
    readme: 'readme',
    security: 'security',
    contributing: 'contributing',
    changelog: 'changelog',
    changes: 'changelog',
    history: 'changelog',
    license: 'license',
};
function detectDocs(rootDir) {
    const docs = [];
    const seen = new Set();
    for (const pattern of DOC_PATTERNS) {
        const matches = glob_1.glob.sync(pattern, {
            cwd: rootDir,
            nodir: true,
            ignore: ['**/node_modules/**', '**/dist/**'],
        });
        for (const match of matches) {
            if (seen.has(match))
                continue;
            seen.add(match);
            const fullPath = path.join(rootDir, match);
            const content = safeReadFile(fullPath);
            if (!content || content.length < 10)
                continue;
            // Skip the ARCHITECTURE.md we generate
            const basename = path.basename(match).toLowerCase();
            if (basename === 'architecture.md')
                continue;
            const doc = parseDoc(match, content);
            if (doc)
                docs.push(doc);
        }
    }
    return docs;
}
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return null;
    }
}
function classifyDoc(filePath) {
    const basename = path.basename(filePath).toLowerCase().replace(/\.(md|txt)$/, '');
    return TYPE_MAP[basename] || 'other';
}
function parseDoc(filePath, content) {
    const lines = content.split('\n');
    const headings = [];
    let title = '';
    let summary = '';
    let foundFirstContent = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        // Extract headings
        const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
        if (headingMatch) {
            const heading = headingMatch[1].replace(/[#*`]/g, '').trim();
            if (!title) {
                title = heading;
            }
            else {
                headings.push(heading);
            }
            continue;
        }
        // Get first meaningful paragraph as summary
        if (!foundFirstContent && title && !trimmed.startsWith('![') && !trimmed.startsWith('<') && !trimmed.startsWith('---') && trimmed.length > 10) {
            // Skip badges, HTML, and horizontal rules
            summary = trimmed
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip markdown links
                .replace(/[*_`]/g, '') // strip formatting
                .slice(0, 200);
            foundFirstContent = true;
        }
        // Limit heading extraction
        if (headings.length >= 20)
            break;
    }
    if (!title) {
        // Use filename as title
        title = path.basename(filePath).replace(/\.(md|txt)$/, '');
    }
    return {
        path: filePath,
        type: classifyDoc(filePath),
        title,
        summary,
        headings: headings.slice(0, 15),
    };
}
//# sourceMappingURL=docs.js.map