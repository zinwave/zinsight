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
exports.detectSubsystems = detectSubsystems;
const path = __importStar(require("path"));
function detectSubsystems(files) {
    // Group files by their top-level directory
    const groups = new Map();
    // Find the src/ directory index in paths — it may be nested (e.g. code/src/)
    const srcDirs = new Set(['src', 'lib', 'app']);
    for (const filePath of files.keys()) {
        const parts = filePath.split(path.sep);
        let groupName;
        // Find the src/lib/app directory at any depth and use the next level as the module
        let srcIndex = -1;
        for (let i = 0; i < parts.length; i++) {
            if (srcDirs.has(parts[i])) {
                srcIndex = i;
                break;
            }
        }
        if (srcIndex >= 0 && parts.length > srcIndex + 2) {
            // File is inside src/ (or lib/app) with a subdirectory — use subdirectory as module
            groupName = parts[srcIndex + 1];
        }
        else if (srcIndex >= 0 && parts.length === srcIndex + 2) {
            // File is directly inside src/ (e.g. src/main.ts) — group as "src"
            groupName = parts[srcIndex];
        }
        else if (parts.length > 1) {
            groupName = parts[0];
        }
        else {
            groupName = '(root)';
        }
        if (!groups.has(groupName))
            groups.set(groupName, []);
        groups.get(groupName).push(filePath);
    }
    const subsystems = [];
    for (const [name, groupFiles] of groups) {
        const fileSet = new Set(groupFiles);
        let internalDeps = 0;
        let externalDeps = 0;
        const publicApi = [];
        for (const fp of groupFiles) {
            const node = files.get(fp);
            // Count internal vs external deps
            for (const dep of node.imports) {
                if (fileSet.has(dep)) {
                    internalDeps++;
                }
                else {
                    externalDeps++;
                }
            }
            // If any file outside this subsystem imports this file, it's part of the public API
            for (const importer of node.importedBy) {
                if (!fileSet.has(importer)) {
                    publicApi.push(fp);
                    break;
                }
            }
        }
        subsystems.push({
            name,
            files: groupFiles.sort(),
            publicApi: [...new Set(publicApi)].sort(),
            internalDeps,
            externalDeps,
        });
    }
    return subsystems.sort((a, b) => b.files.length - a.files.length);
}
//# sourceMappingURL=subsystems.js.map