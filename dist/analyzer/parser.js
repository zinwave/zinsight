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
exports.parseFile = parseFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("@babel/parser");
const TS_EXTENSIONS = new Set(['.ts', '.tsx']);
function parseFile(rootDir, relativePath) {
    const fullPath = path.join(rootDir, relativePath);
    let content;
    try {
        content = fs.readFileSync(fullPath, 'utf-8');
    }
    catch {
        return null;
    }
    const ext = path.extname(relativePath).toLowerCase();
    const isTS = TS_EXTENSIONS.has(ext);
    const hasJSX = ext === '.tsx' || ext === '.jsx';
    const plugins = ['decorators-legacy'];
    if (isTS)
        plugins.push('typescript');
    if (hasJSX || !isTS)
        plugins.push('jsx');
    try {
        const ast = (0, parser_1.parse)(content, {
            sourceType: 'unambiguous',
            plugins,
            allowImportExportEverywhere: true,
            allowReturnOutsideFunction: true,
            allowUndeclaredExports: true,
        });
        return { ast, content };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=parser.js.map