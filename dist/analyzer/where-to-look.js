"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWhereToLook = buildWhereToLook;
exports.buildEnvMaturity = buildEnvMaturity;
const CONCEPTS = [
    {
        concept: 'Authentication / Login',
        description: 'Identity, sessions, login flows.',
        pathPatterns: [/auth/i, /\blogin\b/i, /\bsession\b/i, /oauth/i, /jwt/i],
    },
    {
        concept: 'Authorization / Roles',
        description: 'Who can do what — guards, role checks, permissions.',
        pathPatterns: [/guard/i, /roles?/i, /permission/i, /policy/i, /policies/i],
        contentPatterns: [/@Roles\(|hasPermission|requireRole|RBAC/],
    },
    {
        concept: 'Database schemas',
        description: 'Data models — the shape of stored data.',
        pathPatterns: [/[\\/]schemas?[\\/]/i, /[\\/]models?[\\/]/i, /\.entity\.(t|j)s$/i, /\.schema\.(t|j)s$/i],
    },
    {
        concept: 'API endpoints',
        description: 'HTTP routes the server exposes.',
        pathPatterns: [/\.controller\.(t|j)s$/i, /[\\/]routes?[\\/]/i, /[\\/]handlers?[\\/]/i],
    },
    {
        concept: 'Configuration / Environment',
        description: 'Where env vars are read and the server bootstraps.',
        pathPatterns: [/main\.(t|j)s$/i, /[\\/]config[\\/]/i, /\.env/i, /bootstrap/i],
        contentPatterns: [/process\.env\./],
    },
    {
        concept: 'AI / LLM integration',
        description: 'Prompts, model calls, AI-derived signals.',
        pathPatterns: [/[\\/]ai[\\/]/i, /\bllm\b/i, /\bopenai\b/i, /\banthropic\b/i, /\bclaude\b/i, /\bgemini\b/i, /prompt/i],
    },
    {
        concept: 'Email / Notifications',
        description: 'Outbound emails, push, in-app notifications.',
        pathPatterns: [/email/i, /mail/i, /notification/i, /notify/i, /push/i],
        contentPatterns: [/nodemailer|sendgrid|mailgun|postmark|ses\.send/i],
    },
    {
        concept: 'Webhooks',
        description: 'Inbound POSTs from external services.',
        pathPatterns: [/webhook/i, /\bhook\b/i, /[\\/]callbacks?[\\/]/i],
    },
    {
        concept: 'Caching',
        description: 'In-memory, Redis, or other caches.',
        pathPatterns: [/cache/i, /redis/i, /memcached/i],
        contentPatterns: [/\bnew\s+Map\(\)|new\s+LRUCache\b|cache\.(get|set)/],
    },
    {
        concept: 'Logging',
        description: 'Structured logs and log destinations.',
        pathPatterns: [/logger/i, /logging/i, /\.log\.(t|j)s$/i],
        contentPatterns: [/winston|pino|bunyan|console\.log\(/],
    },
    {
        concept: 'Background jobs / Queues',
        description: 'Async work, cron, queue consumers.',
        pathPatterns: [/[\\/]jobs?[\\/]/i, /[\\/]queues?[\\/]/i, /cron/i, /worker/i, /scheduler/i],
        contentPatterns: [/@Cron\(|bull|bullmq|kafka|rabbitmq|sqs|node-cron/i],
    },
    {
        concept: 'File uploads',
        description: 'How user-uploaded files are handled.',
        pathPatterns: [/upload/i, /attachment/i],
        contentPatterns: [/multer|busboy|formidable|FileInterceptor|UploadedFile/i],
    },
    {
        concept: 'Payments / Billing',
        description: 'Payment processing or subscription billing.',
        pathPatterns: [/billing/i, /payment/i, /subscription/i, /invoice/i],
        contentPatterns: [/stripe|paypal|braintree|razorpay/i],
    },
    {
        concept: 'Tests',
        description: 'Where tests live and how they\'re run.',
        pathPatterns: [/\.spec\.(t|j)sx?$/, /\.test\.(t|j)sx?$/, /__tests__/, /[\\/]e2e[\\/]/, /\.e2e-spec\./i],
    },
    {
        concept: 'Deployment / Infra',
        description: 'How and where this app gets deployed.',
        pathPatterns: [/Dockerfile/, /docker-compose/i, /\.github[\\/]workflows/, /\.gitlab-ci/, /[\\/]k8s[\\/]/, /[\\/]terraform[\\/]/, /serverless\.ya?ml/, /vercel\.json/, /netlify\.toml/, /render\.ya?ml/, /fly\.toml/],
    },
];
function buildWhereToLook(input) {
    const out = [];
    for (const def of CONCEPTS) {
        const matches = new Set();
        // Path matches
        for (const fp of input.allFilePaths) {
            if (def.pathPatterns.some((re) => re.test(fp)))
                matches.add(fp);
        }
        // Content matches (only if patterns are defined — skip otherwise to keep
        // results lean and avoid grep-like full-corpus scans for every concept)
        if (def.contentPatterns && matches.size === 0) {
            for (const [fp, content] of input.contentMap) {
                if (def.contentPatterns.some((re) => re.test(content))) {
                    matches.add(fp);
                    if (matches.size >= 8)
                        break;
                }
            }
        }
        // Filter out obviously-noisy paths
        const filtered = [...matches]
            .filter((f) => !/[\\/]node_modules[\\/]/.test(f))
            .filter((f) => !/\.d\.ts$/.test(f))
            .sort();
        out.push({
            concept: def.concept,
            description: def.description,
            files: filtered.slice(0, 5),
            detected: filtered.length > 0,
        });
    }
    return out;
}
/* ============================ Env Var Maturity ============================ */
// Order matters — first match wins. Put more-specific provider patterns before
// generic SECRET/API_KEY patterns so OPENAI_API_KEY routes to "AI features"
// rather than the generic crypto bucket.
const RISK_HEURISTICS = [
    { pattern: /MONGO|DATABASE|POSTGRES|MYSQL|REDIS|DB_URL/i, risk: 'Server cannot connect to its database — startup will fail or queries will throw.' },
    { pattern: /OPENAI|ANTHROPIC|GEMINI|GROQ|HUGGING|MISTRAL|COHERE/i, risk: 'AI features disabled — graceful fallback expected if missing.' },
    { pattern: /STRIPE|PAYPAL|BRAINTREE|RAZORPAY|BILLING/i, risk: 'Payment / billing flows will fail.' },
    { pattern: /SMTP|SENDGRID|MAILGUN|POSTMARK/i, risk: 'Outbound email will fail.' },
    { pattern: /JWT|SESSION_SECRET|COOKIE_SECRET/i, risk: 'Auth/sessions will fail or be insecure with default value.' },
    { pattern: /SLACK|ZOOM|ATLASSIAN|GITHUB|GOOGLE|AWS_/i, risk: 'Integration with this provider unavailable.' },
    { pattern: /SECRET|PRIVATE_KEY|API_KEY|API_SECRET/i, risk: 'Cryptographic operations or external API calls will fail.' },
    { pattern: /CORS_ORIGINS?$/i, risk: 'CORS may default to an unsafe value (often "*") in dev.' },
    { pattern: /^PORT$/i, risk: 'Server defaults to a fallback port.' },
    { pattern: /LOG_LEVEL/i, risk: 'Logging falls back to default verbosity.' },
];
function inferRisk(name) {
    for (const { pattern, risk } of RISK_HEURISTICS) {
        if (pattern.test(name))
            return risk;
    }
    return 'Unknown — depends on what this variable controls.';
}
function buildEnvMaturity(input) {
    const out = [];
    for (const c of input.envContracts) {
        // Each env-var contract has a description like "Reads X" — use the first
        // ALL_CAPS token as the variable name when not already exposed.
        const nameMatch = c.description.match(/`([A-Z_][A-Z0-9_]*)`/) || c.description.match(/\b([A-Z][A-Z0-9_]+)\b/);
        const name = nameMatch?.[1] || c.description.trim();
        // Skip noise: env-var-looking names must be SHOUTY_SNAKE and >= 2 chars.
        // This filters out detector false positives where the description didn't
        // surface a real variable name (we'd otherwise show garbage rows).
        if (!/^[A-Z][A-Z0-9_]+$/.test(name))
            continue;
        // Look for default fallback patterns across the files that reference this var.
        // Patterns: `process.env.NAME || 'default'`, `process.env.NAME ?? 'default'`,
        //           `process.env.NAME || NAME_DEFAULT`, `process.env['NAME'] || ...`
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fallbackPatterns = [
            new RegExp(`process\\.env\\.${escaped}\\s*(?:\\|\\||\\?\\?)\\s*(['"\`])([^'"\`]*)\\1`),
            new RegExp(`process\\.env\\[['"]${escaped}['"]\\]\\s*(?:\\|\\||\\?\\?)\\s*(['"\`])([^'"\`]*)\\1`),
            new RegExp(`process\\.env\\.${escaped}\\s*(?:\\|\\||\\?\\?)\\s*([A-Z_][A-Z0-9_]+)`),
        ];
        let defaultValue = null;
        for (const fp of c.files) {
            const content = input.contentMap.get(fp);
            if (!content)
                continue;
            for (const pat of fallbackPatterns) {
                const m = content.match(pat);
                if (m) {
                    // Group 2 holds the literal value if a quoted pattern matched;
                    // fall back to group 1 for the identifier-style fallback.
                    defaultValue = (m[2] !== undefined ? m[2] : m[1]) ?? null;
                    break;
                }
            }
            if (defaultValue !== null)
                break;
        }
        out.push({
            name,
            required: defaultValue === null,
            defaultValue,
            files: c.files,
            riskHint: inferRisk(name),
        });
    }
    // Sort: required first, then alphabetical
    out.sort((a, b) => {
        if (a.required !== b.required)
            return a.required ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return out;
}
//# sourceMappingURL=where-to-look.js.map