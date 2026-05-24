import * as fs from 'fs';
import * as path from 'path';
import type { File as ASTFile } from '@babel/types';
import type { AnalysisResult, CapabilitySet, FileNode, Language, ProjectInfo, ProjectKind, RiskArea, ParseResult, RouteEndpoint, DatabaseConnection, ExternalService, DeploymentInfo, FrontendInfo, LifecycleEvent } from '../types';
import { discoverFiles } from './file-discovery';
import { parseFile } from './parser';
import { buildDependencyGraph } from './dependency-graph';
import { computeComplexity } from './complexity';
import { detectEntryPoints } from './entry-points';
import { detectSubsystems } from './subsystems';
import { scanContracts } from './contracts';
import { detectDatabases } from './database';
import { detectExternalServices } from './external-services';
import { detectRoutes } from './routes';
import { detectTechStack, getAllDeps } from './tech-stack';
import { detectDeployment } from './deployment';
import { detectSwagger } from './swagger';
import { detectDocs } from './docs';
import { detectGitHeatmap } from './git-heatmap';
import { buildGlossary } from './glossary';
import { buildHappyPath } from './happy-path';
import {
  inferFolderPurposes,
  buildStateMap,
  detectConventions,
  buildReadingPaths,
  buildExternalContracts,
  detectLifecycleEvents,
  inferAntiPurposes,
} from './orientation';
import { analyzeFrontend } from './frontend';
import { buildWhereToLook, buildEnvMaturity } from './where-to-look';

interface ProgressCallback {
  (message: string): void;
}

interface AnalyzeOptions {
  /** Override project name (e.g. from `--name` CLI flag). */
  name?: string;
}

export function analyze(rootDir: string, onProgress?: ProgressCallback, options: AnalyzeOptions = {}): AnalysisResult {
  const log = onProgress || (() => {});

  // 0. Resolve the actual project root.
  //    Some monorepo/SAM conventions (e.g. Cimpress) put the real code under
  //    `code/`, while the directory the CLI is pointed at only contains
  //    `template.yaml`, CI config, and a thin README. We descend at most one
  //    level when the immediate root has no analyzable code but a single
  //    obvious child does.
  const invokedFrom = rootDir;
  const resolvedRoot = resolveProjectRoot(rootDir);
  if (resolvedRoot !== rootDir) {
    log(`Descending into project root: ${path.relative(rootDir, resolvedRoot) || resolvedRoot}`);
  }

  // 1. Read project info
  log('Reading project info...');
  const language = detectLanguage(resolvedRoot);
  const project = readProjectInfo(resolvedRoot, invokedFrom, language, options);

  // 2. Discover files
  log('Discovering files...');
  const filePaths = discoverFiles(resolvedRoot);
  log(`Found ${filePaths.length} files`);

  // Shift the active root down for the rest of the pipeline. Most downstream
  // analyzers read from rootDir; reassign so they see the resolved location.
  rootDir = resolvedRoot;

  // 3. Parse all files
  log('Parsing files...');
  const parsed = new Map<string, ParseResult | null>();
  let parseFailures = 0;
  for (const fp of filePaths) {
    const result = parseFile(rootDir, fp);
    parsed.set(fp, result);
    if (!result) parseFailures++;
  }
  log(`Parsed ${filePaths.length - parseFailures} files (${parseFailures} skipped)`);

  // 4. Build dependency graph
  log('Building dependency graph...');
  const fileNodes = buildDependencyGraph(parsed, rootDir);

  // 5. Compute complexity
  log('Computing complexity scores...');
  for (const [fp, result] of parsed) {
    if (!result) continue;
    const node = fileNodes.get(fp);
    if (!node) continue;
    const { complexity, maxNestingDepth } = computeComplexity(result.ast);
    node.complexity = complexity;
    node.maxNestingDepth = maxNestingDepth;
  }

  // 6. Detect entry points
  log('Detecting entry points...');
  const entryPoints = detectEntryPoints(rootDir, filePaths);

  // 7. Detect subsystems
  log('Detecting subsystems...');
  const subsystems = detectSubsystems(fileNodes);

  // 8. Scan contracts
  log('Scanning for implicit contracts...');
  const astMap = new Map<string, ASTFile | null>();
  for (const [fp, result] of parsed) {
    astMap.set(fp, result?.ast || null);
  }
  const contracts = scanContracts(astMap);

  // 9. Compute risk areas
  log('Identifying risk areas...');
  const riskAreas = computeRiskAreas(fileNodes);

  // 10. Detect databases (before tech stack so we can filter false positives)
  log('Scanning for database connections...');
  const packageDeps = getAllDeps(rootDir);
  const databases = detectDatabases(astMap, packageDeps);

  // 11. Detect tech stack (use actual DB types to filter package.json-only deps)
  log('Detecting tech stack...');
  const actualDbTypes = new Set(databases.map(db => db.type));
  const techStack = detectTechStack(rootDir, filePaths, actualDbTypes, project.language);

  // 12. Detect external services
  log('Detecting external service integrations...');
  const contentMap = new Map<string, string>();
  for (const [fp, result] of parsed) {
    if (result) contentMap.set(fp, result.content);
  }
  const externalServices = detectExternalServices(astMap, contentMap);

  // 13. Detect routes
  log('Detecting API routes and endpoints...');
  const routes = detectRoutes(astMap);

  // 14. Detect deployment info (Dockerfiles, docker-compose, CI/CD, k8s)
  log('Scanning for deployment configuration...');
  const deployment = detectDeployment(rootDir);

  // 15. Detect Swagger/OpenAPI
  log('Checking for API documentation specs...');
  const swagger = detectSwagger(rootDir, astMap);

  // 16. Detect project docs (README, SECURITY, CONTRIBUTING, etc.)
  log('Scanning project documentation...');
  const docs = detectDocs(rootDir);

  // 17. Git change frequency heatmap (optional — needs git repo)
  log('Reading git history for change frequency...');
  const gitHeatmap = detectGitHeatmap(rootDir, filePaths);

  // 18. Glossary — domain vocabulary
  log('Building domain glossary...');
  const allModels = databases.flatMap((d) => d.modelSchemas);
  const glossary = buildGlossary({ models: allModels, routes, subsystems, files: fileNodes });

  // 19. Happy Path — representative request trace
  log('Tracing the happy path...');
  const happyPath = buildHappyPath({
    routes,
    files: fileNodes,
    asts: astMap,
    databases,
    externalServices,
    rootDir,
  });

  // 20. Folder purpose inference
  log('Inferring folder purposes...');
  const folderPurposes = inferFolderPurposes({ subsystems, routes, databases, files: fileNodes, rootDir });

  // 21. State map
  log('Mapping state surfaces...');
  const envContracts = contracts.filter((c) => c.type === 'env-var');
  const stateSurfaces = buildStateMap({
    databases,
    envContracts,
    asts: astMap,
    contentMap,
    rootDir,
    packageDeps: new Set(Object.keys(packageDeps)),
  });

  // 22. Conventions
  log('Detecting code conventions...');
  const conventions = detectConventions({
    subsystems,
    routes,
    databases,
    files: fileNodes,
    contentMap,
  });

  // 23. Reading paths (scenario-based)
  log('Building scenario-based reading paths...');
  const readingPaths = buildReadingPaths({
    subsystems,
    routes,
    databases,
    files: fileNodes,
    entryPoints,
  });

  // 24. External contracts
  log('Detailing external contracts...');
  const externalContracts = buildExternalContracts({ externalServices, routes, contentMap });

  // 25. Lifecycle events
  log('Detecting lifecycle events...');
  const lifecycleEvents = detectLifecycleEvents({
    routes,
    asts: astMap,
    contentMap,
    entryPoints,
  });

  // 26. Anti-purpose is computed AFTER capabilities so it can read from the
  //     same truth-set. We compute capabilities eagerly here and re-use the
  //     value for both anti-purposes and the final result.
  // (placeholder — anti-purposes computed below after capabilities)

  // 27. Frontend orientation (React Router, hooks, stores, styling)
  log('Detecting frontend characteristics...');
  const packageDepsSet = new Set(Object.keys(packageDeps));
  const frontend = analyzeFrontend({
    rootDir,
    files: filePaths,
    asts: astMap,
    contentMap,
    packageDeps: packageDepsSet,
  });

  // 27.5 Detect project kind (CLI / library / static-site / frontend / backend / lambda / fullstack)
  //      Threaded into where-to-look gating and the renderer.
  const projectKind = detectProjectKind({
    rootDir,
    files: filePaths,
    fileNodes,
    routes,
    frontend,
    deployment,
    entryPoints,
    techStack,
  });
  project.kind = projectKind;

  // 28. Where to Look — concept-to-path map
  log('Building "where to look" concept map...');
  const whereToLook = buildWhereToLook({
    files: fileNodes,
    contentMap,
    allFilePaths: filePaths,
    projectKind,
  });

  // 29. Configuration maturity (required vs optional env vars + risk hints)
  log('Assessing configuration maturity...');
  const envMaturity = buildEnvMaturity({ envContracts, contentMap });

  // 29.5 Capabilities truth-set. Single source of truth that both the
  //      "Core Capabilities" surface and the "What This Repo Isn't" surface
  //      read from — eliminates same-doc contradictions.
  const capabilities = computeCapabilities({
    routes,
    databases,
    frontend,
    externalServices,
    contentMap,
    deployment,
    lifecycleEvents,
    rootDir,
    files: fileNodes,
  });

  // 29.6 Anti-purposes (what this repo ISN'T) — now reads from capabilities.
  log('Inferring out-of-scope characteristics...');
  const antiPurposes = inferAntiPurposes({
    rootDir,
    files: fileNodes,
    routes,
    databases,
    externalServices,
    contentMap,
    capabilities,
    projectKind,
  });

  // 30. Compute stats
  let totalLoc = 0;
  for (const node of fileNodes.values()) {
    totalLoc += node.loc;
  }

  log('Analysis complete');

  return {
    project,
    files: fileNodes,
    subsystems,
    entryPoints,
    riskAreas,
    contracts,
    databases,
    externalServices,
    routes,
    techStack,
    deployment,
    docs,
    swagger,
    gitHeatmap,
    glossary,
    happyPath,
    folderPurposes,
    stateSurfaces,
    conventions,
    readingPaths,
    externalContracts,
    lifecycleEvents,
    antiPurposes,
    frontend,
    whereToLook,
    envMaturity,
    capabilities,
    stats: {
      totalFiles: filePaths.length,
      totalLoc,
      parseFailures,
    },
  };
}

function readProjectInfo(rootDir: string, invokedFrom: string, language: Language, options: AnalyzeOptions): ProjectInfo {
  const pkgPath = path.join(rootDir, 'package.json');
  let pkgName = '';
  let version = '0.0.0';
  let description = '';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkgName = pkg.name || '';
    version = pkg.version || '0.0.0';
    description = pkg.description || '';
  } catch {
    /* missing or unreadable — fall through */
  }

  // Prefer (in order):
  //   1. explicit `--name` option
  //   2. parent folder name if it differs from `code/`, `src/`, `app/`, etc.
  //      (because the resolver may have descended into a generic subdir)
  //   3. package.json name
  //   4. basename of resolved root
  const generic = new Set(['code', 'src', 'lib', 'app', 'backend', 'frontend', 'server', 'client']);
  const resolvedBase = path.basename(rootDir);
  const parentBase = path.basename(path.dirname(rootDir));
  let name: string;
  if (options.name) {
    name = options.name;
  } else if (generic.has(resolvedBase.toLowerCase()) && parentBase && parentBase !== '/') {
    // We descended into a generic dir — use the parent (the actual project)
    name = parentBase;
  } else if (!generic.has(resolvedBase.toLowerCase()) && resolvedBase) {
    name = resolvedBase;
  } else {
    name = pkgName || path.basename(invokedFrom);
  }

  return {
    name,
    version,
    description,
    kind: 'unknown',
    language,
    languageSupported: language === 'js-ts',
    resolvedRoot: rootDir,
    invokedFrom,
  };
}

/**
 * Find the directory that actually contains analyzable code.
 * Many cimpress repos put their NestJS code under `code/`; some place a thin
 * `package.json` at the repo root (for serverless tooling only) and the real
 * project lives in `src/` of a sub-folder. We descend at most one level when
 * the cwd has no code but a single obvious child does.
 */
function resolveProjectRoot(start: string): string {
  // Already a real project?
  if (hasAnalyzableCode(start)) return start;

  const candidates = ['code', 'src', 'app', 'server', 'backend', 'frontend', 'client', 'ui', 'web'];
  for (const sub of candidates) {
    const candidate = path.join(start, sub);
    if (!fs.existsSync(candidate)) continue;
    if (!fs.statSync(candidate).isDirectory()) continue;
    if (hasAnalyzableCode(candidate)) {
      return candidate;
    }
  }
  return start; // give up — caller will see "0 files" output
}

function hasAnalyzableCode(dir: string): boolean {
  try {
    // Quick heuristic: package.json declaring deps + a src/ or any .ts/.tsx/.js/.jsx file directly
    const pkgPath = path.join(dir, 'package.json');
    const hasPkg = fs.existsSync(pkgPath);
    if (!hasPkg) return false;
    let pkg: any = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
      return false;
    }
    const allDeps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
      ...(pkg?.peerDependencies || {}),
    };
    if (Object.keys(allDeps).length === 0) return false;

    // Existence of a src/ or app/ directory under this candidate, OR any
    // top-level .ts/.js/.tsx/.jsx file, qualifies.
    for (const sub of ['src', 'app', 'lib']) {
      if (fs.existsSync(path.join(dir, sub))) return true;
    }
    const entries = fs.readdirSync(dir);
    for (const f of entries) {
      if (/\.(tsx?|jsx?|mjs|cjs)$/.test(f)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Identify the primary implementation language. We do this BEFORE file
 * discovery so the CLI can warn early about non-JS/TS projects (PHP/Symfony,
 * Python/FastAPI, Go, Terraform) where zinsight will produce a near-empty doc.
 *
 * Rule:
 *   - If both composer.json AND package.json exist, the one with substantial
 *     `dependencies` wins (lots of cimpress repos have a stub `package.json`
 *     for serverless tooling with a real Symfony app underneath).
 */
function detectLanguage(rootDir: string): Language {
  const has = (rel: string) => fs.existsSync(path.join(rootDir, rel));
  const depCount = (file: string, keys: string[]): number => {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf-8'));
      let n = 0;
      for (const k of keys) n += Object.keys(p[k] || {}).length;
      return n;
    } catch {
      return 0;
    }
  };

  const jsTsDeps = has('package.json') ? depCount('package.json', ['dependencies']) : 0;
  const phpDeps = has('composer.json')
    ? (() => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(rootDir, 'composer.json'), 'utf-8'));
          return Object.keys(p.require || {}).length;
        } catch { return 0; }
      })()
    : 0;

  // Cimpress mcpcommunicator pattern: package.json with only serverless devDeps,
  // composer.json + symfony.lock with the real code.
  if (phpDeps > 0 && jsTsDeps === 0) return 'php';
  if (phpDeps > 0 && phpDeps >= jsTsDeps * 2) return 'php';

  if (has('go.mod')) return 'go';
  if (has('Cargo.toml')) return 'rust';
  if (has('pyproject.toml') || has('requirements.txt') || has('Pipfile')) return 'python';
  if (has('Gemfile')) return 'ruby';
  if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) return 'java';

  // Terraform-only (gitlab-infrastructure) — no manifest, but lots of .tf files.
  try {
    const entries = fs.readdirSync(rootDir);
    if (entries.some((e) => e.endsWith('.tf'))) {
      const hasPkg = has('package.json');
      if (!hasPkg) return 'terraform';
    }
  } catch { /* ignore */ }

  if (has('package.json')) return 'js-ts';
  return 'unknown';
}

/**
 * Infer what kind of project this is. Conservative — when in doubt prefers
 * `unknown` so downstream gating leaves sections in.
 */
function detectProjectKind(input: {
  rootDir: string;
  files: string[];
  fileNodes: Map<string, FileNode>;
  routes: RouteEndpoint[];
  frontend: FrontendInfo;
  deployment: DeploymentInfo;
  entryPoints: { label: string; filePath: string }[];
  techStack: { frameworks: string[] };
}): ProjectKind {
  const { rootDir, files, frontend, routes, deployment, entryPoints } = input;

  // Lambda — SAM / Serverless Framework manifest in the repo
  const hasSamTemplate = fs.existsSync(path.join(rootDir, 'template.yaml')) || fs.existsSync(path.join(rootDir, 'template.yml'));
  const hasServerlessYml = fs.existsSync(path.join(rootDir, 'serverless.yml')) || fs.existsSync(path.join(rootDir, 'serverless.yaml'));
  // Also handle the case where these live one level up (cimpress code/ layout)
  const parent = path.dirname(rootDir);
  const hasSamParent = parent !== rootDir && (fs.existsSync(path.join(parent, 'template.yaml')) || fs.existsSync(path.join(parent, 'template.yml')));
  const hasSlsParent = parent !== rootDir && (fs.existsSync(path.join(parent, 'serverless.yml')) || fs.existsSync(path.join(parent, 'serverless.yaml')));
  const isLambda = hasSamTemplate || hasServerlessYml || hasSamParent || hasSlsParent;

  if (isLambda && routes.length > 0) return 'lambda';

  // CLI — package.json declares `bin` and entry-points include a bin file
  const pkgPath = path.join(rootDir, 'package.json');
  let isCli = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.bin && Object.keys(pkg.bin).length > 0) {
      isCli = true;
    }
  } catch { /* ignore */ }
  if (!isCli && entryPoints.some((e) => /\bbin[\\/:]/.test(e.label) || /[\\/]bin[\\/]/.test(e.filePath))) {
    isCli = true;
  }

  const hasIndexHtml = fs.existsSync(path.join(rootDir, 'index.html')) || fs.existsSync(path.join(rootDir, 'public', 'index.html'));
  const hasFrontend = frontend.detected;
  const hasBackend = routes.length > 0;

  if (isCli && !hasFrontend && !hasBackend) return 'cli';
  if (hasFrontend && hasBackend) return 'fullstack';
  if (hasFrontend) return 'frontend';
  if (hasBackend) {
    if (isLambda) return 'lambda';
    return 'backend-server';
  }

  // Library — no entry-point web server, no frontend, but exports + tests
  if (!hasFrontend && !hasBackend && files.length > 0) {
    // Pure static site — `index.html` + assets, no JSX detected
    if (hasIndexHtml && !files.some((f) => /\.(tsx|jsx)$/.test(f))) return 'static-site';
    return 'library';
  }

  return 'unknown';
}

/**
 * Build the single source of truth for what this repo can/can't do.
 * Positive capabilities → drives "Core Capabilities" rendering.
 * Negated capabilities → drives "What This Repo Isn't" rendering.
 * Same set, same decisions, no contradictions.
 */
function computeCapabilities(input: {
  routes: RouteEndpoint[];
  databases: DatabaseConnection[];
  frontend: FrontendInfo;
  externalServices: ExternalService[];
  contentMap: Map<string, string>;
  deployment: DeploymentInfo;
  lifecycleEvents: LifecycleEvent[];
  rootDir: string;
  files: Map<string, FileNode>;
}): CapabilitySet {
  const { routes, databases, frontend, externalServices, contentMap, lifecycleEvents } = input;

  // Auth — any route uses a guard, OR auth.* file exists, OR auth-related dep
  const hasAuth =
    routes.some((r) => r.guards && r.guards.length > 0) ||
    [...input.files.keys()].some((f) => /[\\/]auth[\\/]/.test(f) || /\.auth\.(t|j)s/.test(f) || /[\\/]middleware[\\/].*auth/i.test(f));

  const hasAuthorization =
    routes.some((r) => r.guards && r.guards.some((g) => /role|permission|rbac|policy/i.test(g))) ||
    [...input.files.keys()].some((f) => /[\\/](roles?|permissions?|rbac|policies?)[\\/]/i.test(f));

  // Payments — strong signal: payment SDK import OR known-payment external service OR
  //            a top-level payments controller/route AND a payment SDK dep.
  let hasPaymentImport = false;
  for (const [, content] of contentMap) {
    if (/from\s+['"](stripe|@paypal\/|braintree|razorpay)['"]/.test(content) || /new\s+Stripe\s*\(/.test(content) || /new\s+Razorpay\s*\(/.test(content)) {
      hasPaymentImport = true;
      break;
    }
  }
  const hasPaymentService = externalServices.some((s) => /stripe|paypal|braintree|square|razorpay/i.test(s.label));
  const hasPaymentRoute = routes.some((r) => /\/(payments?|billing|invoice|subscription)(\/|$)/.test(r.path));
  const hasPayments = hasPaymentImport || hasPaymentService || (hasPaymentRoute && hasPaymentImport);

  // File uploads — multer / FileInterceptor / formidable in source.
  let hasFileUploads = false;
  for (const [, content] of contentMap) {
    if (/from\s+['"](multer|busboy|formidable)['"]/.test(content) || /FileInterceptor\s*\(/.test(content) || /@UploadedFiles?\s*\(/.test(content)) {
      hasFileUploads = true;
      break;
    }
  }
  if (!hasFileUploads) {
    // also detect Lambda multipart upload path
    if (routes.some((r) => /\/(upload|attachment)/i.test(r.path)) && [...contentMap.values()].some((c) => /multipart\/form-data/.test(c))) {
      hasFileUploads = true;
    }
  }

  // AI / LLM — provider SDK import OR known LLM external service.
  let hasAi = false;
  for (const [, content] of contentMap) {
    if (
      /from\s+['"](openai|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/[^'"]+|groq-sdk|together-ai|@huggingface\/inference|ollama)['"]/.test(content) ||
      /openrouter\.ai\/api/.test(content)
    ) {
      hasAi = true;
      break;
    }
  }
  if (!hasAi && externalServices.some((s) => /openai|anthropic|claude|gemini|openrouter|mistral|cohere|huggingface|groq|together\.ai/i.test(s.label))) {
    hasAi = true;
  }

  // Background jobs / queues
  let hasBackgroundJobs = false;
  for (const [, content] of contentMap) {
    if (
      /from\s+['"](bull|bullmq|kafkajs|amqplib|@aws-sdk\/client-sqs|kue|agenda)['"]/.test(content) ||
      /\bnew\s+Queue\s*\(/.test(content) ||
      /SQSClient\s*\(/.test(content) ||
      /KafkaProducer\s*\(/.test(content)
    ) {
      hasBackgroundJobs = true;
      break;
    }
  }

  // Scheduled jobs — explicit cron. setInterval alone is NOT counted (too
  // many false positives from UI polling). We require a NestJS `@Cron(...)`
  // decorator, node-cron schedule, or a known scheduler library import.
  const hasScheduledJobs = lifecycleEvents.some((e) => e.kind === 'scheduled');

  // Email
  let hasEmailNotifications = false;
  for (const [, content] of contentMap) {
    if (
      /from\s+['"](nodemailer|@sendgrid\/[^'"]+|mailgun(\.js)?|postmark|@aws-sdk\/client-ses)['"]/.test(content) ||
      /\bcreateTransport\s*\(/.test(content) ||
      /\bSES(?:Client)?\.sendEmail\s*\(/.test(content)
    ) {
      hasEmailNotifications = true;
      break;
    }
  }

  // Caching — Redis-like import OR LRU cache OR class-level Map cache.
  let hasCaching = false;
  for (const [, content] of contentMap) {
    if (
      /from\s+['"](ioredis|redis|@nestjs\/cache-manager|cache-manager|lru-cache)['"]/.test(content) ||
      /\bnew\s+LRUCache\s*\(/.test(content)
    ) {
      hasCaching = true;
      break;
    }
  }

  // Multi-region — explicit secondary region config
  let hasMultiRegion = false;
  for (const [, content] of contentMap) {
    if (/(secondary|replica|multi[-_]?region)/i.test(content) && /REGION|region.*=.*['"](us-|eu-|ap-)/.test(content)) {
      hasMultiRegion = true;
      break;
    }
  }

  const hasWebhooks = routes.some((r) => /\bwebhook\b/i.test(r.path));

  return {
    hasHttpApi: routes.length > 0,
    hasDatabase: databases.length > 0,
    hasFrontend: frontend.detected,
    hasAuth,
    hasAuthorization,
    hasPayments,
    hasAi,
    hasWebhooks,
    hasFileUploads,
    hasBackgroundJobs,
    hasScheduledJobs,
    hasEmailNotifications,
    hasCaching,
    hasMultiRegion,
    hasLambdaTriggers: hasLambdaManifest(input.rootDir),
  };
}

function hasLambdaManifest(rootDir: string): boolean {
  const here = (n: string) => fs.existsSync(path.join(rootDir, n));
  const up = (n: string) => fs.existsSync(path.join(path.dirname(rootDir), n));
  return here('template.yaml') || here('template.yml') || here('serverless.yml') || here('serverless.yaml')
      || up('template.yaml') || up('template.yml') || up('serverless.yml') || up('serverless.yaml');
}

function computeRiskAreas(files: Map<string, import('../types').FileNode>): RiskArea[] {
  const risks: RiskArea[] = [];

  for (const [fp, node] of files) {
    if (node.parseError) continue;
    const reasons: string[] = [];

    if (node.complexity > 20) {
      reasons.push(`high complexity (${node.complexity})`);
    }
    if (node.maxNestingDepth > 5) {
      reasons.push(`deep nesting (${node.maxNestingDepth} levels)`);
    }
    if (node.importedBy.length > 10) {
      reasons.push(`many dependents (${node.importedBy.length})`);
    }
    if (node.loc > 300) {
      reasons.push(`large file (${node.loc} lines)`);
    }

    if (reasons.length > 0) {
      risks.push({
        filePath: fp,
        reasons,
        complexity: node.complexity,
        dependents: node.importedBy.length,
        nesting: node.maxNestingDepth,
      });
    }
  }

  // Sort by number of risk reasons, then by complexity
  return risks.sort((a, b) => {
    if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
    return b.complexity - a.complexity;
  });
}
