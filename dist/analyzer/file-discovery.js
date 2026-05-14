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
exports.discoverFiles = discoverFiles;
const glob_1 = require("glob");
const path = __importStar(require("path"));
const EXTENSIONS = '*.{js,jsx,ts,tsx,mjs,cjs}';
const IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/coverage/**',
    '**/__tests__/**',
    '**/__mocks__/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.d.ts',
    '**/.git/**',
    '**/vendor/**',
    '**/*.min.js',
    '**/*.bundle.js',
];
function discoverFiles(rootDir) {
    const pattern = path.join('**', EXTENSIONS);
    const files = glob_1.glob.sync(pattern, {
        cwd: rootDir,
        ignore: IGNORE_PATTERNS,
        absolute: false,
        nodir: true,
    });
    return files.sort();
}
//# sourceMappingURL=file-discovery.js.map