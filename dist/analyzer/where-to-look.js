"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWhereToLook = buildWhereToLook;
exports.buildEnvMaturity = buildEnvMaturity;
// SEGMENT match: split the path on / or \ and test each segment intact.
// Lets us write `/policy/` (literal segment) without false-matching
// `privacyPolicy.tsx`.
function pathSegmentTest(fp, re) {
    // First try the full-path regex (allows callers to use directory anchors
    // like `[\\/]schemas?[\\/]`). Then fall back to per-segment matching for
    // word-anchored patterns.
    if (re.test(fp)) {
        // Reject if the match is purely a substring inside one segment that
        // begins with a different word (e.g. `policy` inside `privacyPolicy`).
        // Detect this by checking each segment in isolation.
        const segs = fp.split(/[\\/]/);
        const reSrc = re.source;
        // If the pattern uses explicit segment anchors (`[\\/]`) we trust the
        // full-path result. Otherwise insist the match falls on a segment that
        // starts (or ends) with the matched token.
        if (reSrc.includes('\\/') || reSrc.includes('[\\\\/]'))
            return true;
        for (const seg of segs) {
            if (!re.test(seg))
                continue;
            const m = seg.match(re);
            if (!m)
                continue;
            const matched = m[0];
            const idx = seg.indexOf(matched);
            const before = idx === 0 ? '' : seg[idx - 1];
            const after = idx + matched.length >= seg.length ? '' : seg[idx + matched.length];
            // accept when adjacent characters are non-alpha (true word boundary)
            // or when the match sits at the segment edge.
            const safe = (!before || !/[A-Za-z]/.test(before)) && (!after || !/[A-Za-z]/.test(after));
            if (safe)
                return true;
        }
        return false;
    }
    return false;
}
const CONCEPTS = [
    {
        concept: 'Authentication / Login',
        description: 'Identity, sessions, login flows.',
        pathPatterns: [/\bauth\b/i, /\blogin\b/i, /\bsession\b/i, /\boauth\b/i, /\bjwt\b/i],
    },
    {
        concept: 'Authorization / Roles',
        description: 'Who can do what — guards, role checks, permissions.',
        pathPatterns: [/\bguard\b/i, /\broles?\b/i, /\bpermissions?\b/i, /[\\/]policies?[\\/]/i, /\brbac\b/i],
        // Content patterns now look for real call sites / decorators, not bare words
        contentPatterns: [/@Roles\s*\(/, /hasPermission\s*\(/, /requireRole\s*\(/, /CanActivate\s*\)/, /AuthGuard\s*[(.]/],
        minContentMatches: 2,
    },
    {
        concept: 'Database schemas',
        description: 'Data models — the shape of stored data.',
        pathPatterns: [/[\\/]schemas?[\\/]/i, /[\\/]models?[\\/]/i, /\.entity\.(t|j)s$/i, /\.schema\.(t|j)s$/i],
        requiredKind: ['backend-server', 'lambda', 'fullstack', 'library'],
    },
    {
        concept: 'API endpoints',
        description: 'HTTP routes the server exposes.',
        pathPatterns: [/\.controller\.(t|j)s$/i, /[\\/]routes?[\\/]/i, /[\\/]handlers?[\\/]/i],
        requiredKind: ['backend-server', 'lambda', 'fullstack'],
    },
    {
        concept: 'Configuration / Environment',
        description: 'Where env vars are read and the server bootstraps.',
        pathPatterns: [/main\.(t|j)s$/i, /[\\/]config[\\/]/i, /\.env/i, /bootstrap/i],
        contentPatterns: [/process\.env\.[A-Z]/],
        minContentMatches: 2,
    },
    {
        concept: 'AI / LLM integration',
        description: 'Prompts, model calls, AI-derived signals.',
        pathPatterns: [/[\\/]ai[\\/]/i, /\bllm\b/i, /\bopenai\b/i, /\banthropic\b/i, /\bclaude\b/i, /\bgemini\b/i, /\bopenrouter\b/i, /\bmistral\b/i, /\bcohere\b/i, /\bollama\b/i, /\bprompt\b/i],
        contentPatterns: [/from\s+['"]openai['"]/, /from\s+['"]@anthropic-ai\/sdk['"]/, /from\s+['"]@google\/generative-ai['"]/, /from\s+['"]@google\/genai['"]/, /from\s+['"]cohere-ai['"]/, /from\s+['"]@mistralai\//, /openrouter\.ai\/api/, /https?:\/\/api\.openai\.com/, /https?:\/\/api\.anthropic\.com/],
        minContentMatches: 1,
    },
    {
        concept: 'Email / Notifications',
        description: 'Outbound emails, push, in-app notifications.',
        pathPatterns: [/\bemail\b/i, /\bmailer?\b/i, /\bnotifications?\b/i, /\bnotify\b/i, /\bsmtp\b/i],
        contentPatterns: [/from\s+['"]nodemailer['"]/, /from\s+['"]@sendgrid/, /from\s+['"]mailgun/, /from\s+['"]postmark/, /\bses\.sendEmail\s*\(/, /createTransport\s*\(/],
        minContentMatches: 1,
    },
    {
        concept: 'Webhooks',
        description: 'Inbound POSTs from external services.',
        pathPatterns: [/\bwebhooks?\b/i, /[\\/]callbacks?[\\/]/i],
    },
    {
        concept: 'Caching',
        description: 'In-memory, Redis, or other caches.',
        pathPatterns: [/\bcache\b/i, /\bredis\b/i, /\bmemcached\b/i],
        contentPatterns: [/from\s+['"]ioredis['"]/, /from\s+['"]redis['"]/, /createClient\s*\(\s*\{[^}]*url\s*:/, /new\s+LRUCache\s*\(/, /\bRedisService\b/],
        minContentMatches: 1,
    },
    {
        concept: 'Logging',
        description: 'Structured logs and log destinations.',
        pathPatterns: [/\blogger\b/i, /\blogging\b/i, /\.log\.(t|j)s$/i, /[\\/]audit[\\/]/i],
        contentPatterns: [/from\s+['"]winston['"]/, /from\s+['"]pino['"]/, /from\s+['"]bunyan['"]/, /new\s+Logger\s*\(/, /@nestjs\/common['"][^;]*Logger/],
        minContentMatches: 1,
    },
    {
        concept: 'Background jobs / Queues',
        description: 'Async work, cron, queue consumers.',
        pathPatterns: [/[\\/]jobs?[\\/]/i, /[\\/]queues?[\\/]/i, /\bcron\b/i, /\bworker\b/i, /\bscheduler\b/i, /\bconsumers?\b/i],
        contentPatterns: [/@Cron\s*\(/, /from\s+['"]bullmq['"]/, /from\s+['"]bull['"]/, /from\s+['"]kafkajs['"]/, /from\s+['"]amqplib['"]/, /from\s+['"]@aws-sdk\/client-sqs['"]/, /from\s+['"]node-cron['"]/, /SQSClient\s*\(/, /KafkaProducer\s*\(/],
        minContentMatches: 1,
    },
    {
        concept: 'File uploads',
        description: 'How user-uploaded files are handled.',
        pathPatterns: [/\buploads?\b/i, /\battachments?\b/i],
        contentPatterns: [/from\s+['"]multer['"]/, /from\s+['"]busboy['"]/, /from\s+['"]formidable['"]/, /FileInterceptor\s*\(/, /@UploadedFiles?\s*\(/],
        minContentMatches: 1,
    },
    {
        concept: 'Payments / Billing',
        description: 'Payment processing or subscription billing.',
        pathPatterns: [/\bbilling\b/i, /\bpayments?\b/i, /\bsubscriptions?\b/i, /\binvoices?\b/i],
        contentPatterns: [/from\s+['"]stripe['"]/, /from\s+['"]@paypal/, /from\s+['"]braintree['"]/, /from\s+['"]razorpay['"]/, /new\s+Stripe\s*\(/],
        minContentMatches: 1,
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
// Paths that match heuristically but rarely represent the canonical location
// for the concept. We rank them last when picking representative files.
const DEMOTED_PATH = /([\\/](scripts?|migrations?|seeds?|fixtures?|tests?|__tests__|examples?|samples?|dev-docker-related|tools?)[\\/])/i;
function buildWhereToLook(input) {
    const out = [];
    const projectKind = input.projectKind;
    for (const def of CONCEPTS) {
        // Skip concepts that don't apply to this project kind
        if (def.requiredKind && projectKind && !def.requiredKind.includes(projectKind)) {
            out.push({
                concept: def.concept,
                description: def.description,
                files: [],
                detected: false,
            });
            continue;
        }
        const matches = new Set();
        // Path matches — use segment-aware test
        for (const fp of input.allFilePaths) {
            if (def.pathPatterns.some((re) => pathSegmentTest(fp, re)))
                matches.add(fp);
        }
        // Content matches — only as a fallback, requiring stronger evidence.
        // We count files that hit at least one pattern AND track how many
        // *distinct* patterns matched across those files (to suppress
        // single-word coincidences). To avoid self-matching on a regex source
        // that contains the literal "Roles" etc., we ignore matches inside
        // backtick-delimited regex-source-looking lines.
        if (def.contentPatterns && matches.size === 0) {
            const distinctPatterns = new Set();
            const candidate = new Set();
            for (const [fp, content] of input.contentMap) {
                // skip files unlikely to be the "where this lives" answer
                if (/\.(spec|test|e2e-spec)\.(t|j)sx?$/.test(fp))
                    continue;
                const ctx = stripStringAndRegexLiterals(content);
                for (let i = 0; i < def.contentPatterns.length; i++) {
                    if (def.contentPatterns[i].test(ctx)) {
                        distinctPatterns.add(i);
                        candidate.add(fp);
                        break;
                    }
                }
            }
            const need = def.minContentMatches ?? 1;
            if (candidate.size >= need || distinctPatterns.size >= 2) {
                for (const fp of candidate)
                    matches.add(fp);
            }
        }
        // Filter out obviously-noisy paths
        const filtered = [...matches]
            .filter((f) => !/[\\/]node_modules[\\/]/.test(f))
            .filter((f) => !/\.d\.ts$/.test(f))
            .sort((a, b) => {
            // Demote scripts/migrations/seeds to the bottom of the list
            const aDemoted = DEMOTED_PATH.test(a) ? 1 : 0;
            const bDemoted = DEMOTED_PATH.test(b) ? 1 : 0;
            if (aDemoted !== bDemoted)
                return aDemoted - bDemoted;
            return a.localeCompare(b);
        });
        out.push({
            concept: def.concept,
            description: def.description,
            files: filtered.slice(0, 5),
            detected: filtered.length > 0,
        });
    }
    return out;
}
// Remove string literals and regex bodies from content so that detection
// patterns can't false-match on text that exists purely inside a string or
// regex literal (zinsight's own detection-pattern source text being the
// canonical example).
function stripStringAndRegexLiterals(src) {
    // Conservatively replace contents of single/double/template quotes and
    // /.../ regex literals with whitespace. This is a heuristic — we don't
    // need to be a parser; just remove enough noise to avoid self-matching.
    return src
        .replace(/\/\/[^\n]*/g, '') // line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
        .replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '``')
        .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
        .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
        .replace(/\/(?![*/])(?:\\.|\[[^\]\n]*\]|[^/\\\n])+\/[gimsuy]*/g, '//');
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
        // Redact sensitive defaults — never publish secrets in the doc.
        // Sensitive when EITHER:
        //   (a) the variable name names a secret/credential, OR
        //   (b) the value embeds URL credentials (`scheme://user:pass@host`), OR
        //   (c) the value looks like a known credential token, OR
        //   (d) the value is a long opaque base64/hex-ish string.
        const sensitiveName = /SECRET|PASSWORD|PASSWD|API[_-]?KEY|TOKEN|PRIVATE[_-]?KEY|CREDENTIALS?|DSN|CONNECTION[_-]?STRING/i.test(name);
        const urlWithCreds = defaultValue !== null && /:\/\/[^/\s:@]+:[^@/\s]+@/.test(defaultValue);
        const tokenShape = defaultValue !== null && /^(sk-|ghp_|gho_|ghs_|xox[bp]-|AKIA[0-9A-Z]{16})/.test(defaultValue);
        const opaqueLong = defaultValue !== null && defaultValue.length >= 32 && /^[A-Za-z0-9+/=_-]{32,}$/.test(defaultValue) && !/^https?:/.test(defaultValue);
        let displayDefault = defaultValue;
        if (defaultValue !== null && (sensitiveName || urlWithCreds || tokenShape || opaqueLong)) {
            displayDefault = '<redacted>';
        }
        out.push({
            name,
            required: defaultValue === null,
            defaultValue: displayDefault,
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