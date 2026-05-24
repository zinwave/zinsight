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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeFrontend = analyzeFrontend;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const traverse_1 = __importDefault(require("@babel/traverse"));
/**
 * Frontend orientation pass.
 * Pure heuristics: file shapes (.tsx/.jsx), framework deps in package.json,
 * AST patterns for React Router routes, Zustand/Redux/Context stores, custom
 * hooks (files exporting `useXxx`), and styling conventions.
 */
function analyzeFrontend(input) {
    const { rootDir, files, asts, contentMap, packageDeps } = input;
    const empty = {
        detected: false,
        framework: null,
        routerLib: null,
        routes: [],
        componentCount: 0,
        pageCount: 0,
        customHooks: [],
        stateStores: [],
        stylingApproach: [],
    };
    // 1. Detect framework — first via root deps, then via nested package.jsons
    // (monorepo / Forge static UI), then via JSX file presence as a fallback.
    let framework = detectFramework(rootDir, packageDeps);
    if (!framework) {
        const mergedDeps = collectNestedDeps(rootDir);
        if (mergedDeps.size > 0) {
            framework = detectFramework(rootDir, mergedDeps);
        }
    }
    if (!framework) {
        // Fallback: presence of multiple .tsx/.jsx files with `import React`
        // strongly suggests a React app even when deps aren't in root package.json.
        const jsxFiles = files.filter((f) => /\.(tsx|jsx)$/.test(f));
        if (jsxFiles.length >= 5) {
            let reactImports = 0;
            for (const f of jsxFiles.slice(0, 30)) {
                const c = contentMap.get(f) || '';
                if (/from\s+['"]react['"]/.test(c) || /from\s+['"]react-dom['"]/.test(c))
                    reactImports += 1;
                if (reactImports >= 3)
                    break;
            }
            if (reactImports >= 3)
                framework = 'react';
        }
    }
    if (!framework)
        return empty;
    // 2. Detect router library — also consider nested package.jsons for monorepos
    const allDeps = new Set([...packageDeps, ...collectNestedDeps(rootDir)]);
    const routerLib = detectRouter(allDeps, files);
    // 3. Extract React Router routes (if any)
    const routes = [];
    if (routerLib === 'react-router') {
        routes.push(...extractReactRouterRoutes(asts));
    }
    else if (routerLib === 'next-app' || routerLib === 'next-pages') {
        routes.push(...extractNextRoutes(rootDir, files));
    }
    // 4. Count components vs pages
    let componentCount = 0;
    let pageCount = 0;
    const customHooks = [];
    for (const fp of files) {
        if (!/\.(tsx|jsx)$/.test(fp))
            continue;
        if (/[\\/](pages|app|routes)[\\/]/.test(fp)) {
            pageCount += 1;
        }
        else if (/[\\/](components|ui)[\\/]/.test(fp) || /\.component\.(tsx|jsx)$/.test(fp)) {
            componentCount += 1;
        }
        // Custom hooks: file basename matches `useFoo.tsx?` (in /hooks/ or anywhere)
        const base = (fp.split('/').pop() || '').replace(/\.[jt]sx?$/, '');
        if (/^use[A-Z][A-Za-z0-9]+/.test(base)) {
            customHooks.push(base);
        }
    }
    // 5. State stores
    const stateStores = detectStateStores(asts, contentMap, packageDeps);
    // 6. Styling
    const stylingApproach = detectStyling(rootDir, files, packageDeps, contentMap);
    return {
        detected: true,
        framework,
        routerLib,
        routes: routes.slice(0, 50), // cap for readable output
        componentCount,
        pageCount,
        customHooks: [...new Set(customHooks)].sort(),
        stateStores,
        stylingApproach,
    };
}
/* ----------------------- framework + router detection ----------------------- */
/**
 * Walk top-level subdirectories and any `static/*` / `apps/*` / `packages/*`
 * folders (one level deep) to find nested package.json files. Used to detect
 * frameworks in monorepos and Forge apps where the React UI lives under
 * `static/main/package.json` rather than the root.
 */
function collectNestedDeps(rootDir) {
    const out = new Set();
    const candidates = [];
    // Inspect a small set of common monorepo locations
    for (const dir of ['static', 'apps', 'packages', 'frontend', 'client', 'web', 'ui']) {
        const full = path.join(rootDir, dir);
        if (!fs.existsSync(full))
            continue;
        let entries;
        try {
            entries = fs.readdirSync(full);
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const sub = path.join(full, entry, 'package.json');
            if (fs.existsSync(sub))
                candidates.push(sub);
        }
    }
    for (const pj of candidates) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pj, 'utf-8'));
            for (const k of Object.keys(pkg.dependencies || {}))
                out.add(k);
            for (const k of Object.keys(pkg.devDependencies || {}))
                out.add(k);
            for (const k of Object.keys(pkg.peerDependencies || {}))
                out.add(k);
        }
        catch {
            /* ignore unreadable / malformed package.json */
        }
    }
    return out;
}
function detectFramework(rootDir, deps) {
    if (deps.has('next'))
        return 'next';
    if (deps.has('@remix-run/react') || deps.has('@remix-run/node'))
        return 'remix';
    if (deps.has('svelte') || deps.has('@sveltejs/kit'))
        return 'svelte';
    if (deps.has('vue') || deps.has('nuxt'))
        return 'vue';
    if (deps.has('react') || deps.has('react-dom')) {
        // Vite + React vs CRA — both look like React, but vite.config existence is a cleaner hint
        const hasVite = fs.existsSync(path.join(rootDir, 'vite.config.ts')) ||
            fs.existsSync(path.join(rootDir, 'vite.config.js')) ||
            deps.has('vite');
        return hasVite ? 'vite-react' : 'react';
    }
    return null;
}
function detectRouter(deps, files) {
    if (deps.has('react-router-dom') || deps.has('react-router'))
        return 'react-router';
    if (deps.has('@tanstack/react-router'))
        return 'tanstack-router';
    if (deps.has('next')) {
        // Next App Router uses /app, Pages Router uses /pages
        const hasApp = files.some((f) => /^app[\\/]/.test(f) || /[\\/]app[\\/]layout\.(t|j)sx?$/.test(f));
        const hasPages = files.some((f) => /^pages[\\/]/.test(f));
        if (hasApp)
            return 'next-app';
        if (hasPages)
            return 'next-pages';
    }
    return null;
}
/* ----------------------- React Router extraction ----------------------- */
function extractReactRouterRoutes(asts) {
    const out = [];
    // Helper — extract `path=...` from a JSX opening element, if present.
    const extractPath = (open) => {
        if (!open?.attributes)
            return null;
        for (const attr of open.attributes) {
            if (attr.type !== 'JSXAttribute')
                continue;
            if (attr.name?.name !== 'path')
                continue;
            const v = attr.value;
            if (v?.type === 'StringLiteral')
                return v.value;
        }
        return null;
    };
    const joinPath = (parent, child) => {
        if (!parent)
            return child;
        if (!child)
            return parent;
        if (child.startsWith('/'))
            return child; // child is absolute
        const p = parent.endsWith('/') ? parent.slice(0, -1) : parent;
        const c = child.startsWith('/') ? child : '/' + child;
        return p + c;
    };
    for (const [fp, ast] of asts) {
        if (!ast)
            continue;
        // CRA / older React projects keep JSX in plain .js files. Don't restrict
        // to .tsx/.jsx — the parser already produced an AST whether it parsed JSX.
        if (!/\.(tsx|jsx|ts|js)$/.test(fp))
            continue;
        (0, traverse_1.default)(ast, {
            JSXOpeningElement(p) {
                const name = p.node.name;
                if (name.type !== 'JSXIdentifier' || name.name !== 'Route')
                    return;
                const attrs = p.node.attributes;
                let routePath = null;
                let componentRef;
                for (const attr of attrs) {
                    if (attr.type !== 'JSXAttribute')
                        continue;
                    const aname = attr.name.name;
                    if (aname === 'path') {
                        const v = attr.value;
                        if (v?.type === 'StringLiteral')
                            routePath = v.value;
                    }
                    if (aname === 'element') {
                        const v = attr.value;
                        if (v?.type === 'JSXExpressionContainer') {
                            const inner = v.expression;
                            if (inner?.type === 'JSXElement' && inner.openingElement?.name?.type === 'JSXIdentifier') {
                                componentRef = inner.openingElement.name.name;
                            }
                        }
                    }
                    if (aname === 'component') {
                        const v = attr.value;
                        if (v?.type === 'JSXExpressionContainer' && v.expression?.type === 'Identifier') {
                            componentRef = v.expression.name;
                        }
                    }
                }
                if (routePath === null)
                    return;
                // Walk up to find enclosing <Route path="..."> ancestors so that
                // <Route path="dashboards" /> nested under <Route path="/app"> is
                // recorded as `/app/dashboards`, not `dashboards`.
                //
                // Start ascent from the JSXElement that contains *this* opening
                // element's parent — skipping our own enclosing JSXElement (whose
                // path we already used as `routePath`).
                let fullPath = routePath;
                let cursor = p.parentPath?.parentPath; // skip our own JSXElement
                while (cursor) {
                    const node = cursor.node;
                    if (node && node.type === 'JSXElement' && node.openingElement?.name?.type === 'JSXIdentifier' && node.openingElement.name.name === 'Route') {
                        const parentPath = extractPath(node.openingElement);
                        if (parentPath !== null) {
                            fullPath = joinPath(parentPath, fullPath);
                            if (parentPath.startsWith('/'))
                                break;
                        }
                    }
                    cursor = cursor.parentPath;
                }
                out.push({ path: fullPath, componentRef, file: fp });
            },
        });
    }
    return out;
}
/* ----------------------- Next.js route extraction ----------------------- */
function extractNextRoutes(_rootDir, files) {
    const out = [];
    for (const fp of files) {
        // Next App Router: app/**/page.tsx → route is the directory path
        let m = fp.match(/^app\/(.*)\/page\.(t|j)sx?$/);
        if (m) {
            const segments = m[1].split('/');
            const cleaned = segments
                .filter((s) => !s.startsWith('(') && !s.startsWith('_'))
                .map((s) => {
                // [id] → :id, [...slug] → :slug*
                if (/^\[\.\.\.[^\]]+\]$/.test(s))
                    return ':' + s.slice(4, -1) + '*';
                if (/^\[[^\]]+\]$/.test(s))
                    return ':' + s.slice(1, -1);
                return s;
            });
            const routePath = '/' + cleaned.join('/');
            out.push({ path: routePath, file: fp });
            continue;
        }
        // Next Pages Router: pages/**/index.tsx | pages/**/foo.tsx
        m = fp.match(/^pages\/(.*)\.(t|j)sx?$/);
        if (m) {
            const stem = m[1].replace(/\/index$/, '');
            const segments = stem.split('/').filter(Boolean);
            const cleaned = segments.map((s) => {
                if (/^\[\.\.\.[^\]]+\]$/.test(s))
                    return ':' + s.slice(4, -1) + '*';
                if (/^\[[^\]]+\]$/.test(s))
                    return ':' + s.slice(1, -1);
                return s;
            });
            const routePath = '/' + cleaned.join('/');
            // skip api routes (those are server-side)
            if (routePath.startsWith('/api/'))
                continue;
            out.push({ path: routePath || '/', file: fp });
        }
    }
    return out;
}
/* ----------------------- State stores ----------------------- */
function detectStateStores(asts, contentMap, packageDeps) {
    const out = [];
    // Zustand: `import { create } from 'zustand'` + `create(...)`
    if (packageDeps.has('zustand')) {
        for (const [fp, ast] of asts) {
            if (!ast)
                continue;
            const content = contentMap.get(fp) || '';
            if (!/from\s+['"]zustand['"]/.test(content))
                continue;
            let storeName;
            (0, traverse_1.default)(ast, {
                VariableDeclarator(p) {
                    const init = p.node.init;
                    if (init?.type === 'CallExpression' &&
                        ((init.callee?.name === 'create') ||
                            (init.callee?.type === 'CallExpression' && init.callee.callee?.name === 'create'))) {
                        if (p.node.id.type === 'Identifier') {
                            storeName = p.node.id.name;
                        }
                    }
                },
            });
            out.push({ kind: 'zustand', name: storeName, file: fp });
        }
    }
    // Redux Toolkit slices
    if (packageDeps.has('@reduxjs/toolkit') || packageDeps.has('redux')) {
        for (const [fp, content] of contentMap) {
            if (!/createSlice\s*\(|combineReducers\s*\(/.test(content))
                continue;
            const m = content.match(/name:\s*['"]([a-zA-Z0-9_-]+)['"]/);
            out.push({ kind: 'redux', name: m?.[1], file: fp });
        }
    }
    // React Context — `const FooContext = createContext(...)`
    for (const [fp, ast] of asts) {
        if (!ast)
            continue;
        if (!/\.(tsx|jsx)$/.test(fp))
            continue;
        (0, traverse_1.default)(ast, {
            VariableDeclarator(p) {
                const init = p.node.init;
                if (init?.type === 'CallExpression' &&
                    init.callee?.type === 'Identifier' &&
                    init.callee.name === 'createContext') {
                    if (p.node.id.type === 'Identifier') {
                        out.push({ kind: 'context', name: p.node.id.name, file: fp });
                    }
                }
            },
        });
    }
    // Jotai / Recoil / MobX
    if (packageDeps.has('jotai')) {
        for (const [fp, content] of contentMap) {
            if (/from\s+['"]jotai['"]/.test(content) && /atom\(/.test(content)) {
                out.push({ kind: 'jotai', file: fp });
            }
        }
    }
    if (packageDeps.has('recoil')) {
        for (const [fp, content] of contentMap) {
            if (/from\s+['"]recoil['"]/.test(content) && /atom\(|selector\(/.test(content)) {
                out.push({ kind: 'recoil', file: fp });
            }
        }
    }
    if (packageDeps.has('mobx') || packageDeps.has('mobx-react') || packageDeps.has('mobx-react-lite')) {
        for (const [fp, content] of contentMap) {
            if (/observable|makeObservable|makeAutoObservable/.test(content)) {
                out.push({ kind: 'mobx', file: fp });
            }
        }
    }
    // Cap each kind to a reasonable number for readability
    const capped = [];
    const counts = new Map();
    for (const s of out) {
        const c = counts.get(s.kind) || 0;
        if (c >= 6)
            continue;
        counts.set(s.kind, c + 1);
        capped.push(s);
    }
    return capped;
}
/* ----------------------- Styling detection ----------------------- */
function detectStyling(rootDir, files, deps, _contentMap) {
    const out = [];
    if (deps.has('tailwindcss') || fs.existsSync(path.join(rootDir, 'tailwind.config.js')) || fs.existsSync(path.join(rootDir, 'tailwind.config.ts'))) {
        out.push('Tailwind CSS');
    }
    if (deps.has('styled-components'))
        out.push('styled-components');
    if (deps.has('@emotion/styled') || deps.has('@emotion/react'))
        out.push('Emotion');
    if (files.some((f) => /\.module\.(css|scss|sass)$/.test(f)))
        out.push('CSS Modules');
    if (files.some((f) => /\.scss$/.test(f)) && !out.includes('CSS Modules'))
        out.push('SCSS');
    if (files.some((f) => /\.css$/.test(f)) && out.length === 0)
        out.push('Plain CSS');
    if (deps.has('@vanilla-extract/css'))
        out.push('Vanilla Extract');
    if (deps.has('@stitches/react'))
        out.push('Stitches');
    return out;
}
//# sourceMappingURL=frontend.js.map