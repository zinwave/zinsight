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
exports.inferFolderPurposes = inferFolderPurposes;
exports.buildStateMap = buildStateMap;
exports.detectConventions = detectConventions;
exports.buildReadingPaths = buildReadingPaths;
exports.buildExternalContracts = buildExternalContracts;
exports.detectLifecycleEvents = detectLifecycleEvents;
exports.inferAntiPurposes = inferAntiPurposes;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const traverse_1 = __importDefault(require("@babel/traverse"));
const subsystems_1 = require("./subsystems");
/* ============================ FolderPurpose ============================ */
const FOLDER_README_NAMES = ['README.md', 'readme.md', 'CLAUDE.md', 'AGENTS.md', '.docs.md', 'ARCHITECTURE.md'];
function findFolderReadme(rootDir, subFiles) {
    // Find the shallowest common directory of the subsystem files.
    if (subFiles.length === 0)
        return null;
    const dirs = subFiles.map((f) => f.substring(0, f.lastIndexOf('/')));
    // Use the first directory's path components and trim down to commonality
    const split = dirs[0].split('/');
    let prefixLen = split.length;
    for (let i = 1; i < dirs.length; i++) {
        const parts = dirs[i].split('/');
        let j = 0;
        while (j < prefixLen && j < parts.length && parts[j] === split[j])
            j++;
        prefixLen = j;
    }
    if (prefixLen === 0)
        return null;
    const folderRel = split.slice(0, prefixLen).join('/');
    const folderAbs = path.join(rootDir, folderRel);
    for (const name of FOLDER_README_NAMES) {
        const full = path.join(folderAbs, name);
        if (!fs.existsSync(full))
            continue;
        try {
            const content = fs.readFileSync(full, 'utf-8');
            const lines = content.split('\n');
            // Title: first non-empty heading or filename-based.
            let title = '';
            for (const line of lines) {
                const m = line.match(/^#\s+(.+?)\s*$/);
                if (m) {
                    title = m[1];
                    break;
                }
            }
            if (!title)
                title = name.replace(/\.md$/i, '');
            // Summary: first non-heading, non-empty paragraph.
            let summary = '';
            for (const line of lines) {
                const t = line.trim();
                if (!t) {
                    if (summary)
                        break;
                    continue;
                }
                if (t.startsWith('#'))
                    continue;
                if (t.startsWith('---'))
                    continue;
                summary += (summary ? ' ' : '') + t;
                if (summary.length >= 200)
                    break;
            }
            if (summary.length > 220)
                summary = summary.slice(0, 217) + '...';
            return {
                path: path.posix.join(folderRel, name),
                title,
                summary,
            };
        }
        catch {
            /* unreadable — try next */
        }
    }
    return null;
}
function inferFolderPurposes(input) {
    const out = [];
    const skipNames = new Set(['root', 'src', 'test', 'tests']);
    for (const sub of input.subsystems) {
        if (skipNames.has(sub.name.toLowerCase()))
            continue;
        // Skip peripheral dirs (scripts/migrations/seeds/tools/fixtures) —
        // they're not feature modules.
        if ((0, subsystems_1.isPeripheralModule)(sub.name))
            continue;
        const routes = input.routes.filter((r) => r.file.includes(`/${sub.name}/`) || r.file.includes(`\\${sub.name}\\`));
        const models = input.databases
            .flatMap((d) => d.modelSchemas)
            .filter((m) => m.file.includes(`/${sub.name}/`) || m.file.includes(`/schemas/`));
        let liner = '';
        // Look up the folder README first — if the module has its own README with
        // a real summary, use that as the one-liner. This catches custom-named
        // modules (e.g. `analyzer`, `parser`, `generator`) that the fixed
        // allow-list below can't describe.
        const readme = findFolderReadme(input.rootDir, sub.files) || undefined;
        const readmeSummary = readme?.summary?.trim() || '';
        if (sub.name === 'auth' || /^auth/i.test(sub.name)) {
            liner = 'Identity, sessions, role guards. Every request passes through here.';
        }
        else if (/integrations?$/.test(sub.name) || sub.name.includes('integration')) {
            liner = 'External service clients (OAuth, API calls, webhook handlers).';
        }
        else if (sub.name === 'schemas') {
            liner = `Database models (${models.length || 'multiple'} schemas) — single source of truth for data shape.`;
        }
        else if (sub.name === 'common' || sub.name === 'shared' || sub.name === 'utils') {
            liner = 'Shared helpers and cross-cutting utilities.';
        }
        else if (sub.name === 'mongo' || sub.name === 'db' || sub.name === 'database') {
            liner = 'Database connection and bootstrap.';
        }
        else if (sub.name === 'health') {
            liner = 'Health/liveness probes for the platform.';
        }
        else if (sub.name === 'lifecycle') {
            liner = 'App install/uninstall hooks and platform lifecycle events.';
        }
        else if (sub.name === 'ai' || sub.name === 'ml') {
            liner = 'AI/LLM integration and prompts.';
        }
        else if (routes.length > 0) {
            // Infer from dominant verb
            const verbs = countVerbs(routes);
            const top = topResource(routes);
            const action = verbs.GET > verbs.POST + verbs.PATCH + verbs.DELETE
                ? 'Read APIs'
                : 'CRUD APIs';
            liner = `${action} for ${top || sub.name} (${routes.length} endpoint${routes.length === 1 ? '' : 's'}).`;
        }
        else if (readmeSummary) {
            // Prefer the README summary over the generic fallback.
            liner = readmeSummary.length > 160 ? readmeSummary.slice(0, 157) + '...' : readmeSummary;
        }
        else {
            // Name-based heuristic before falling back to the truly generic line.
            const named = nameBasedPurpose(sub.name);
            if (named) {
                liner = named;
            }
            else {
                liner = `Feature module — ${sub.files.length} file${sub.files.length === 1 ? '' : 's'}, ${sub.publicApi.length} public export${sub.publicApi.length === 1 ? '' : 's'}.`;
            }
        }
        out.push({ name: sub.name, oneLiner: liner, readme });
    }
    return out;
}
// Name-based purpose inference. Catches well-known module names that aren't
// in the explicit allow-list above. Keep the list small — incorrect labels
// here would propagate through "Modules" and the architecture diagram.
function nameBasedPurpose(name) {
    const n = name.toLowerCase();
    const exact = {
        analyzer: 'Code analysis pipeline.',
        analyzers: 'Code analysis pipeline.',
        parser: 'Parsing utilities.',
        parsers: 'Parsing utilities.',
        generator: 'Output generation (rendering, templating).',
        generators: 'Output generation (rendering, templating).',
        cli: 'Command-line interface entry points.',
        worker: 'Background worker processes.',
        workers: 'Background worker processes.',
        queue: 'Job/message queue consumers.',
        queues: 'Job/message queue consumers.',
        webhook: 'Inbound webhook handlers.',
        webhooks: 'Inbound webhook handlers.',
        notification: 'Notification delivery (email/push/in-app).',
        notifications: 'Notification delivery (email/push/in-app).',
        notify: 'Notification delivery (email/push/in-app).',
        crawler: 'Crawler / scraper code.',
        crawlers: 'Crawler / scraper code.',
        scheduler: 'Scheduled task orchestration.',
        schedulers: 'Scheduled task orchestration.',
        cron: 'Scheduled task orchestration.',
        middleware: 'Cross-cutting request middleware.',
        middlewares: 'Cross-cutting request middleware.',
        config: 'Configuration loading and constants.',
        constants: 'Domain-wide constants.',
        types: 'Shared TypeScript type definitions.',
        models: 'Domain models / data shapes.',
        repository: 'Data-access repositories.',
        repositories: 'Data-access repositories.',
        handlers: 'Lambda / route handlers.',
        handler: 'Lambda / route handlers.',
        stores: 'Client-side state stores.',
        store: 'Client-side state stores.',
        hooks: 'Custom React hooks.',
        components: 'UI components.',
        pages: 'Top-level page/route views.',
        views: 'Top-level page/route views.',
        layouts: 'Layout components shared across pages.',
        services: 'Business logic / service layer.',
        service: 'Business logic / service layer.',
        controllers: 'HTTP controllers.',
        controller: 'HTTP controllers.',
        routes: 'HTTP route definitions.',
        routing: 'HTTP route definitions.',
        mail: 'Email composition and delivery.',
        audit: 'Audit logs and security telemetry.',
        cache: 'Caching layer (Redis / in-memory).',
        caches: 'Caching layer (Redis / in-memory).',
    };
    return exact[n] || null;
}
function countVerbs(routes) {
    const c = { GET: 0, POST: 0, PATCH: 0, PUT: 0, DELETE: 0 };
    for (const r of routes) {
        const m = r.method.toUpperCase();
        if (m in c)
            c[m] += 1;
    }
    return c;
}
function topResource(routes) {
    const segs = routes.map((r) => r.path.split('/').filter(Boolean)[0]).filter(Boolean);
    const counts = new Map();
    for (const s of segs)
        counts.set(s, (counts.get(s) || 0) + 1);
    let best = '';
    let bestCount = 0;
    for (const [k, v] of counts) {
        if (v > bestCount) {
            best = k;
            bestCount = v;
        }
    }
    return best;
}
/* ============================ State Map ============================ */
function buildStateMap(input) {
    const surfaces = [];
    const deps = input.packageDeps ?? new Set();
    // 1. Persistent stores (DB) — prefer src/* schema and service files over
    // top-level scripts (seeds, debug helpers) for the "sample files" hint.
    for (const db of input.databases) {
        const schemaFiles = db.files.filter((f) => f.includes('/schema') || f.includes('/service') || f.startsWith('src/'));
        const sample = (schemaFiles.length > 0 ? schemaFiles : db.files).slice(0, 5);
        surfaces.push({
            kind: 'database',
            description: `${db.type.toUpperCase()} — ${db.modelSchemas.length} model${db.modelSchemas.length === 1 ? '' : 's'}, ${db.operations.length} distinct operation${db.operations.length === 1 ? '' : 's'}.`,
            files: sample,
        });
    }
    // 2. In-memory caches: class fields like `Map`, `Set`, `WeakMap`
    const cacheFiles = [];
    for (const [fp, ast] of input.asts) {
        if (!ast)
            continue;
        let foundCache = false;
        (0, traverse_1.default)(ast, {
            ClassProperty(p) {
                const v = p.node.value;
                if (v?.type === 'NewExpression' &&
                    (v.callee?.name === 'Map' || v.callee?.name === 'Set' || v.callee?.name === 'WeakMap' || v.callee?.name === 'WeakSet')) {
                    foundCache = true;
                }
            },
            ClassDeclaration(p) {
                // also detect "private cache = new Map()" via PropertyDefinition (TS class property)
                const body = p.node.body?.body || [];
                for (const member of body) {
                    const m = member;
                    if (m.type === 'ClassProperty' || m.type === 'PropertyDefinition') {
                        const v = m.value;
                        if (v?.type === 'NewExpression' &&
                            (v.callee?.name === 'Map' || v.callee?.name === 'Set' || v.callee?.name === 'WeakMap')) {
                            foundCache = true;
                        }
                    }
                }
            },
        });
        if (foundCache)
            cacheFiles.push(fp);
    }
    if (cacheFiles.length > 0) {
        surfaces.push({
            kind: 'in-memory-cache',
            description: `Per-process caches via Map/Set instance properties (${cacheFiles.length} file${cacheFiles.length === 1 ? '' : 's'}). Not shared across instances.`,
            files: cacheFiles.slice(0, 5),
        });
    }
    // 3. Forge KVS
    const forgeKvsFiles = [];
    for (const [fp, content] of input.contentMap) {
        if (/@forge\/kvs/.test(content) || /\bkvs\.(get|set|delete|list)/.test(content)) {
            forgeKvsFiles.push(fp);
        }
    }
    if (forgeKvsFiles.length > 0) {
        surfaces.push({
            kind: 'forge-kvs',
            description: 'Atlassian Forge KV Storage — key-value state scoped to the Forge app installation.',
            files: forgeKvsFiles.slice(0, 5),
        });
    }
    // 4. Redis — gate on declared dependency to avoid false-positives from
    // tools (like zinsight itself) that mention "redis" in detection strings.
    const redisDeclared = deps.has('redis') || deps.has('ioredis') || deps.has('@nestjs/cache-manager');
    if (redisDeclared) {
        const redisFiles = [];
        for (const [fp, content] of input.contentMap) {
            if (/from\s+['"](ioredis|redis|@nestjs\/cache-manager)['"]/.test(content) || /\bnew\s+Redis\s*\(/.test(content)) {
                redisFiles.push(fp);
            }
        }
        if (redisFiles.length > 0) {
            surfaces.push({
                kind: 'redis',
                description: 'Redis — likely caching or session/queue store.',
                files: redisFiles.slice(0, 5),
            });
        }
    }
    // 5. Cookie / session — also gate on declared dependency. Otherwise a
    // file that contains the literal regex `cookies.(get|set)` as part of a
    // pattern (as zinsight's own where-to-look.ts does) self-triggers.
    const sessionDeclared = deps.has('cookie-parser') || deps.has('express-session') || deps.has('cookies') || deps.has('iron-session');
    if (sessionDeclared) {
        const cookieFiles = [];
        for (const [fp, content] of input.contentMap) {
            if (/from\s+['"](cookie-parser|express-session|cookies|iron-session)['"]/.test(content) || /\bres\.cookie\s*\(/.test(content)) {
                cookieFiles.push(fp);
            }
        }
        if (cookieFiles.length > 0) {
            surfaces.push({
                kind: 'cookie-session',
                description: 'HTTP cookies / sessions (request-scoped, set on responses).',
                files: cookieFiles.slice(0, 5),
            });
        }
    }
    // 6. Env-driven config (already analyzed)
    if (input.envContracts.length > 0) {
        surfaces.push({
            kind: 'env-config',
            description: `${input.envContracts.length} environment variable${input.envContracts.length === 1 ? '' : 's'} drive runtime behaviour.`,
            files: [],
        });
    }
    // 7. File system writes (best-effort)
    const fsFiles = [];
    for (const [fp, content] of input.contentMap) {
        if (/\bfs\.(writeFile|writeFileSync|appendFile|mkdir|rmdir|unlink)/.test(content)) {
            fsFiles.push(fp);
        }
    }
    if (fsFiles.length > 0) {
        surfaces.push({
            kind: 'file-system',
            description: 'Local file system writes detected — server is not fully stateless.',
            files: fsFiles.slice(0, 5),
        });
    }
    return surfaces;
}
/* ============================ Conventions ============================ */
function detectConventions(input) {
    const out = [];
    // 1. Module-Controller-Service triplets
    let triplets = 0;
    let totalSubs = 0;
    for (const sub of input.subsystems) {
        const hasModule = sub.files.some((f) => /\.module\.(t|j)sx?$/.test(f));
        const hasController = sub.files.some((f) => /\.controller\.(t|j)sx?$/.test(f));
        const hasService = sub.files.some((f) => /\.service\.(t|j)sx?$/.test(f));
        if (hasController || hasService) {
            totalSubs += 1;
            if (hasModule && hasController && hasService)
                triplets += 1;
        }
    }
    if (totalSubs >= 3 && triplets / totalSubs >= 0.6) {
        out.push({
            rule: 'Module → Controller → Service triplet per feature folder',
            evidence: `${triplets} of ${totalSubs} feature folders follow this pattern.`,
        });
    }
    // 2. UUID id pattern in schemas
    const allModels = input.databases.flatMap((d) => d.modelSchemas);
    if (allModels.length > 0) {
        const uuidLike = allModels.filter((m) => m.fields.some((f) => f.name === 'id' && f.type === 'string'));
        if (uuidLike.length / allModels.length >= 0.6) {
            out.push({
                rule: 'String-typed `id` field on most schemas (likely UUID)',
                evidence: `${uuidLike.length} of ${allModels.length} schemas have a string \`id\` field.`,
            });
        }
    }
    // 3. orgId scoping (multi-tenancy convention)
    if (allModels.length > 0) {
        const orgScoped = allModels.filter((m) => m.fields.some((f) => f.name === 'orgId'));
        if (orgScoped.length / allModels.length >= 0.4) {
            out.push({
                rule: 'Tenant scoping via `orgId` on most data models',
                evidence: `${orgScoped.length} of ${allModels.length} schemas declare an \`orgId\` field — every query should be scoped by it.`,
            });
        }
    }
    // 4. Guards on routes
    if (input.routes.length > 0) {
        const guarded = input.routes.filter((r) => r.guards && r.guards.length > 0);
        const publics = input.routes.filter((r) => r.isPublic);
        const ratio = (guarded.length + publics.length) / input.routes.length;
        if (ratio >= 0.5) {
            out.push({
                rule: 'All routes are explicitly guarded or marked @Public',
                evidence: `${guarded.length} guarded + ${publics.length} public, of ${input.routes.length} total routes.`,
                exceptions: input.routes
                    .filter((r) => (!r.guards || r.guards.length === 0) && !r.isPublic)
                    .slice(0, 3)
                    .map((r) => `${r.method} ${r.path}`),
            });
        }
    }
    // 5. DTO validation pattern (NestJS-style)
    let dtoFiles = 0;
    for (const fp of input.files.keys()) {
        if (/[\\/]dto[\\/]/.test(fp))
            dtoFiles += 1;
    }
    if (dtoFiles >= 3) {
        out.push({
            rule: 'Request bodies validated via DTO classes (class-validator)',
            evidence: `${dtoFiles} dedicated DTO files detected.`,
        });
    }
    return out;
}
/* ============================ Reading Paths ============================ */
function buildReadingPaths(input) {
    const paths = [];
    // 1. Understand the request lifecycle
    const requestFiles = [];
    const entry = input.entryPoints.find((e) => /main\.(t|j)sx?$/.test(e.filePath)) || input.entryPoints[0];
    if (entry)
        requestFiles.push({ file: entry.filePath, why: 'Where the app boots and registers everything.' });
    // Find an auth/session middleware
    for (const fp of input.files.keys()) {
        if (/middleware/i.test(fp) || /sessionMiddleware/.test(fp)) {
            requestFiles.push({ file: fp, why: 'Wraps every request — sets req.auth or session.' });
            break;
        }
    }
    // A guard
    for (const fp of input.files.keys()) {
        if (/guard\.(t|j)sx?$/.test(fp) || /[\\/]guard[\\/]/.test(fp)) {
            requestFiles.push({ file: fp, why: 'How access is gated on protected routes.' });
            break;
        }
    }
    // Pick the largest controller + matching service
    const controllers = [...input.files.keys()].filter((f) => /\.controller\.(t|j)sx?$/.test(f));
    if (controllers.length > 0) {
        const biggest = controllers
            .map((f) => ({ f, loc: input.files.get(f)?.loc || 0 }))
            .sort((a, b) => b.loc - a.loc)[0];
        requestFiles.push({ file: biggest.f, why: 'Representative controller — read to see the public API surface.' });
        const svc = biggest.f.replace(/\.controller\./, '.service.');
        if (input.files.has(svc)) {
            requestFiles.push({ file: svc, why: 'The matching service — most business logic lives here.' });
        }
    }
    if (requestFiles.length >= 2) {
        paths.push({
            goal: 'Understand the request lifecycle',
            files: requestFiles.slice(0, 5),
            estimatedMinutes: 15,
        });
    }
    // 2. Understand the data model
    const dataFiles = [];
    const allModels = input.databases.flatMap((d) => d.modelSchemas);
    // Pick top 4 schemas by field count
    const topSchemas = [...allModels].sort((a, b) => b.fields.length - a.fields.length).slice(0, 4);
    for (const m of topSchemas) {
        dataFiles.push({ file: m.file, why: `${m.name} — ${m.fields.length} field${m.fields.length === 1 ? '' : 's'}, central to the domain.` });
    }
    if (dataFiles.length >= 2) {
        paths.push({
            goal: 'Understand the data model',
            files: dataFiles,
            estimatedMinutes: 10,
        });
    }
    // 3. Add a new feature (find smallest "feature module" as cleanest example)
    const featureSubs = input.subsystems
        .filter((s) => !['schemas', 'common', 'mongo', 'health', 'auth'].includes(s.name))
        .filter((s) => s.files.some((f) => /\.controller\.(t|j)sx?$/.test(f)))
        .map((s) => ({ s, total: s.files.reduce((sum, f) => sum + (input.files.get(f)?.loc || 0), 0) }))
        .sort((a, b) => a.total - b.total);
    if (featureSubs.length > 0) {
        const smallest = featureSubs[0].s;
        const featureFiles = [];
        for (const fp of smallest.files) {
            if (/\.module\./.test(fp))
                featureFiles.push({ file: fp, why: 'Module wiring — what to register.' });
            else if (/\.controller\./.test(fp))
                featureFiles.push({ file: fp, why: 'Routes + DTOs.' });
            else if (/\.service\./.test(fp))
                featureFiles.push({ file: fp, why: 'Business logic.' });
        }
        if (featureFiles.length > 0) {
            paths.push({
                goal: 'Add a new feature (template to copy)',
                files: featureFiles,
                estimatedMinutes: 10,
            });
        }
    }
    return paths;
}
/* ============================ External Contracts ============================ */
function buildExternalContracts(input) {
    const contracts = [];
    // Outbound: from externalServices already detected
    for (const svc of input.externalServices) {
        const auth = inferAuthMethod(svc, input.contentMap);
        // Build a useful "we call" hint:
        //   Slack (api)   -> "HTTPS API · GET, POST"
        //   Stripe (api)  -> "HTTPS API"
        //   Auth0 (oauth) -> "OAuth flow"
        let endpointsHint = svc.url.startsWith('http') ? svc.url : `HTTPS · ${svc.url}`;
        if (svc.type === 'oauth') {
            endpointsHint = `OAuth flow (${svc.url})`;
        }
        else if (svc.methods.length > 0) {
            endpointsHint = `${svc.url} (${svc.methods.join(', ')})`;
        }
        contracts.push({
            service: svc.label,
            direction: 'outbound',
            endpoints: [endpointsHint],
            authMethod: auth,
            files: svc.files.slice(0, 3),
        });
    }
    // Inbound: webhook/callback routes we expose
    const inboundPatterns = [/webhook/i, /callback/i, /event/i, /lifecycle/i];
    const inboundByService = new Map();
    for (const r of input.routes) {
        for (const pat of inboundPatterns) {
            if (pat.test(r.path)) {
                // Map to a known service by path keyword
                const svc = inferInboundService(r.path);
                if (!svc)
                    continue;
                if (!inboundByService.has(svc))
                    inboundByService.set(svc, []);
                inboundByService.get(svc).push(r);
                break;
            }
        }
    }
    for (const [service, routes] of inboundByService) {
        const existing = contracts.find((c) => c.service.toLowerCase() === service.toLowerCase());
        if (existing) {
            existing.direction = 'bi-directional';
            existing.receivedAt = routes.map((r) => `${r.method} ${r.path}`).slice(0, 5);
        }
        else {
            contracts.push({
                service,
                direction: 'inbound',
                endpoints: [],
                authMethod: routes.some((r) => r.guards?.some((g) => /hmac|signature/i.test(g))) ? 'HMAC signature' : 'Shared secret / token',
                receivedAt: routes.map((r) => `${r.method} ${r.path}`).slice(0, 5),
                files: routes.map((r) => r.file).slice(0, 3),
            });
        }
    }
    return contracts;
}
function inferAuthMethod(svc, contentMap) {
    if (svc.type === 'oauth')
        return 'OAuth 2.0';
    for (const fp of svc.files) {
        const content = contentMap.get(fp) || '';
        if (/Bearer\s/.test(content) || /Authorization:\s*['"]Bearer/.test(content))
            return 'Bearer token';
        if (/createHmac|crypto\.timingSafeEqual/.test(content) && /signature/i.test(content))
            return 'HMAC signature';
        if (/api[_-]?key/i.test(content))
            return 'API key';
    }
    return 'Unknown';
}
function inferInboundService(routePath) {
    if (/slack/i.test(routePath))
        return 'Slack';
    if (/zoom/i.test(routePath))
        return 'Zoom';
    if (/atlassian|jira|confluence|forge|lifecycle/i.test(routePath))
        return 'Atlassian / Forge';
    if (/stripe/i.test(routePath))
        return 'Stripe';
    if (/github/i.test(routePath))
        return 'GitHub';
    if (/twilio/i.test(routePath))
        return 'Twilio';
    return null;
}
/* ============================ Lifecycle Events ============================ */
function detectLifecycleEvents(input) {
    const events = [];
    // 1. App boot
    const main = input.entryPoints.find((e) => /main\.(t|j)sx?$/.test(e.filePath));
    if (main) {
        events.push({
            kind: 'app-boot',
            description: 'Application bootstrap',
            trigger: 'Process start',
            handler: main.filePath,
        });
    }
    // 2. Generic request flow
    if (input.routes.length > 0) {
        events.push({
            kind: 'request-flow',
            description: 'Per-request lifecycle: middleware → guards → controller → service → response',
            trigger: 'Each HTTP request',
        });
    }
    // 3. Install / uninstall hooks (Forge or generic)
    // Match the trailing path segment precisely to avoid "uninstalled" matching
    // an "install" pattern (and vice versa).
    for (const r of input.routes) {
        const lastSeg = r.path.split('/').filter(Boolean).pop() || '';
        if (/^uninstalled?$/i.test(lastSeg)) {
            events.push({
                kind: 'uninstall',
                description: 'App removed from the host platform',
                trigger: `${r.method} ${r.path}`,
                handler: `${r.file}:${r.handler}`,
            });
        }
        else if (/^installed?$/i.test(lastSeg)) {
            events.push({
                kind: 'install',
                description: 'App installed on the host platform',
                trigger: `${r.method} ${r.path}`,
                handler: `${r.file}:${r.handler}`,
            });
        }
    }
    // 4. Webhooks (true webhooks only — OAuth callbacks are auth flow, not events)
    for (const r of input.routes) {
        if (!/webhook/i.test(r.path))
            continue;
        events.push({
            kind: 'webhook',
            description: 'Inbound webhook from external service',
            trigger: `${r.method} ${r.path}`,
            handler: `${r.file}:${r.handler}`,
        });
    }
    // 5. Scheduled tasks (cron). Require an explicit cron decorator or a known
    // scheduler library. `setInterval()` is intentionally NOT counted — it
    // produces too many false positives from UI polling in React components,
    // retry timers, debouncers, etc. If the user wants those, they belong
    // under "Where State Lives → timers", not under platform-level lifecycle.
    for (const [fp, content] of input.contentMap) {
        // skip frontend files outright — scheduled jobs in JSX are almost always
        // setInterval-driven UI polling, not background jobs.
        if (/\.(tsx|jsx)$/.test(fp))
            continue;
        if (/@Cron\s*\(/.test(content) || /from\s+['"]node-cron['"]/.test(content) || /\bcron\.schedule\s*\(/.test(content) || /from\s+['"]@nestjs\/schedule['"]/.test(content)) {
            const cronMatch = content.match(/@Cron\(['"]([^'"]+)['"]\)/);
            events.push({
                kind: 'scheduled',
                description: 'Scheduled background job',
                trigger: cronMatch ? cronMatch[1] : 'Periodic interval',
                handler: fp,
            });
        }
    }
    // 6. Event emitters
    for (const [fp, content] of input.contentMap) {
        if (/EventEmitter2?|@OnEvent\(|eventEmitter\.emit/.test(content)) {
            events.push({
                kind: 'event-emitter',
                description: 'In-process event publication / subscription',
                trigger: 'Domain event',
                handler: fp,
            });
            break; // one entry is enough
        }
    }
    return events;
}
/* ============================ Anti-Purpose ============================ */
function inferAntiPurposes(input) {
    const out = [];
    const cap = input.capabilities;
    // No frontend — only assert when we definitively didn't find one.
    if (cap ? !cap.hasFrontend : true) {
        const hasReact = [...input.files.keys()].some((f) => /\.(tsx|jsx)$/.test(f));
        const hasFrontendFolder = ['client', 'frontend', 'web', 'ui'].some((d) => fs.existsSync(path.join(input.rootDir, d)));
        if (!hasReact && !hasFrontendFolder) {
            out.push({
                notInScope: 'No frontend in this repo',
                reason: 'No .tsx/.jsx files and no client/frontend/web/ui folder.',
            });
        }
    }
    // No background workers / queues — read from capabilities so it stays
    // consistent with the positive detection.
    if (cap && !cap.hasBackgroundJobs) {
        out.push({
            notInScope: 'No background job queue',
            reason: 'No bull/bullmq/kafkajs/amqplib/SQS client imports detected.',
        });
    }
    // No file uploads
    if (cap && !cap.hasFileUploads) {
        out.push({
            notInScope: 'No file uploads',
            reason: 'No multer/busboy/formidable/FileInterceptor usage detected.',
        });
    }
    // No payment processing
    if (cap && !cap.hasPayments) {
        out.push({
            notInScope: 'No payment processing',
            reason: 'No payment-provider SDK or service detected.',
        });
    }
    // No multi-region replication — only emit for cloud-deployed services.
    // It's noise on a CLI / static site / library.
    const deployableKind = !input.projectKind || ['backend-server', 'lambda', 'fullstack'].includes(input.projectKind);
    if (deployableKind && cap && !cap.hasMultiRegion) {
        out.push({
            notInScope: 'Single-region deployment (no multi-region replication detected)',
            reason: 'No explicit multi-region configuration found.',
        });
    }
    return out;
}
//# sourceMappingURL=orientation.js.map