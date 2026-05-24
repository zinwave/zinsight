import type { File as ASTFile } from '@babel/types';

export type ProjectKind =
  | 'cli'
  | 'library'
  | 'static-site'
  | 'frontend'
  | 'backend-server'
  | 'lambda'
  | 'fullstack'
  | 'unknown';

export type Language = 'js-ts' | 'php' | 'python' | 'go' | 'java' | 'ruby' | 'rust' | 'terraform' | 'unknown';

export interface ProjectInfo {
  name: string;
  version: string;
  description: string;
  /** Detected project type — drives section gating in the renderer. */
  kind: ProjectKind;
  /** Primary implementation language. `js-ts` is the only one fully supported today. */
  language: Language;
  /** True when zinsight is reasonably sure about `language`. */
  languageSupported: boolean;
  /** Resolved root directory (may differ from CLI argument when we descend into code/). */
  resolvedRoot: string;
  /** Path of the original directory the CLI was pointed at — for transparency. */
  invokedFrom: string;
}

/**
 * Detected capabilities of the repo. Built once at the analyzer level so that
 * positive surfaces ("Core Capabilities") and negative ones ("What This Repo
 * Isn't") cannot contradict each other.
 */
export interface CapabilitySet {
  hasHttpApi: boolean;
  hasDatabase: boolean;
  hasFrontend: boolean;
  hasAuth: boolean;
  hasAuthorization: boolean;
  hasPayments: boolean;
  hasAi: boolean;
  hasWebhooks: boolean;
  hasFileUploads: boolean;
  hasBackgroundJobs: boolean;
  hasScheduledJobs: boolean;
  hasEmailNotifications: boolean;
  hasCaching: boolean;
  hasMultiRegion: boolean;
  hasLambdaTriggers: boolean;
}

export interface EntryPoint {
  label: string;
  filePath: string;
}

export interface FileNode {
  filePath: string;
  imports: string[];
  importedBy: string[];
  exportedSymbols: string[];
  envVars: string[];
  complexity: number;
  maxNestingDepth: number;
  loc: number;
  parseError?: string;
}

export interface Subsystem {
  name: string;
  files: string[];
  publicApi: string[];
  internalDeps: number;
  externalDeps: number;
}

export interface RiskArea {
  filePath: string;
  reasons: string[];
  complexity: number;
  dependents: number;
  nesting: number;
}

export interface ImplicitContract {
  type: 'env-var' | 'shared-state' | 'init-order';
  description: string;
  files: string[];
}

export interface DatabaseField {
  name: string;
  type: string;           // e.g. 'string', 'number', 'ObjectId', 'boolean', 'Date', 'Object', 'string[]'
  required?: boolean;
  isArray?: boolean;
  isIndex?: boolean;
  isUnique?: boolean;
  isEnum?: boolean;
  defaultValue?: string;  // e.g. 'null', '[]', 'false'
  ref?: string;           // FK reference to another model
}

export interface ModelSchema {
  name: string;
  fields: DatabaseField[];
  indexes?: string[];
  file: string;
}

export interface DatabaseConnection {
  type: 'mongodb' | 'postgresql' | 'mysql' | 'sqlite' | 'redis' | 'dynamodb' | 'unknown';
  files: string[];
  models: string[];
  operations: string[];
  relationships: DatabaseRelationship[];
  modelSchemas: ModelSchema[];
}

export interface DatabaseRelationship {
  from: string;
  to: string;
  field: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface ExternalService {
  url: string;
  label: string;
  type: 'api' | 'webhook' | 'oauth' | 'cdn' | 'unknown';
  methods: string[];
  files: string[];
}

export interface RouteEndpoint {
  method: string;
  path: string;
  file: string;
  handler: string;
  guards?: string[];       // e.g. ['AuthGuard', 'RolesGuard']
  isPublic?: boolean;      // marked with @Public() or similar
}

export interface TechStack {
  runtime: string;
  languages: string[];
  frameworks: string[];
  databases: string[];
  ormLibraries: string[];
  httpClients: string[];
  authLibraries: string[];
  testingTools: string[];
  buildTools: string[];
  otherNotable: string[];
  scripts: Record<string, string>;
  packageManager?: string;
}

export interface DeploymentInfo {
  dockerfiles: { path: string; baseImage: string; exposedPorts: string[]; stages?: string[] }[];
  composeServices: { name: string; image?: string; ports?: string[]; dependsOn?: string[]; volumes?: string[] }[];
  ciPipelines: { path: string; tool: string; triggers?: string[]; jobs?: string[] }[];
  k8sResources: { path: string; kind: string; name: string }[];
}

export interface ProjectDoc {
  path: string;
  type: 'readme' | 'security' | 'contributing' | 'changelog' | 'license' | 'other';
  title: string;
  summary: string;  // First meaningful paragraph or heading content
  headings: string[];
}

export interface SwaggerInfo {
  specFile?: string;
  version?: string;
  title?: string;
  basePath?: string;
  endpointCount?: number;
  decoratorsUsed: boolean;
  setupFile?: string;
  uiRoute?: string;         // e.g. '/doc', '/api-docs', detected from SwaggerModule.setup()
}

/* ---------------- Orientation features (added) ---------------- */

export interface GitChangeStat {
  filePath: string;
  changeCount: number;
  authorCount: number;
  authors: string[];          // unique authors who touched this file
  lastChanged: string | null; // ISO date
}

export interface GitHeatmap {
  available: boolean;          // false if git not available or not a repo
  windowDays: number;          // typically 180
  files: GitChangeStat[];      // sorted desc by changeCount
}

export type GlossaryKind =
  | 'entity'
  | 'route'
  | 'service'
  | 'role'
  | 'concept';

export interface GlossaryTerm {
  term: string;
  kind: GlossaryKind;
  definition: string;
  source: string; // file or path
}

export interface HappyPathStep {
  label: string;       // e.g. "Middleware: sessionMiddleware"
  file?: string;       // resolved file path
  line?: number;
  details?: string;
}

export interface HappyPath {
  endpoint: string;          // e.g. "GET /oneonones/:id"
  rationale: string;         // why we picked this endpoint
  steps: HappyPathStep[];
}

export interface FolderReadme {
  path: string;              // relative path to the folder README we found
  title: string;             // heading or filename-derived title
  summary: string;           // first meaningful paragraph (truncated)
}

export interface FolderPurpose {
  name: string;              // subsystem name
  oneLiner: string;          // what lives here
  readme?: FolderReadme;     // human-written folder README, if present
}

export interface StateSurface {
  kind:
    | 'database'
    | 'in-memory-cache'
    | 'forge-kvs'
    | 'redis'
    | 'cookie-session'
    | 'env-config'
    | 'file-system';
  description: string;
  files: string[];
}

export interface Convention {
  rule: string;              // human-readable invariant
  evidence: string;          // how we know it
  exceptions?: string[];     // files that break the pattern
}

export interface ReadingPath {
  goal: string;              // e.g. "Understand the request lifecycle"
  files: { file: string; why: string }[];
  estimatedMinutes: number;
}

export interface ExternalContract {
  service: string;           // label
  direction: 'outbound' | 'inbound' | 'bi-directional';
  endpoints: string[];       // up to a few representative paths/calls
  authMethod: string;        // detected/heuristic: 'OAuth 2.0', 'HMAC', 'Bearer', 'API key', etc.
  receivedAt?: string[];     // for inbound: webhook routes we expose
  files: string[];           // representative source files
}

export type LifecycleKind =
  | 'app-boot'
  | 'request-flow'
  | 'install'
  | 'uninstall'
  | 'webhook'
  | 'scheduled'
  | 'event-emitter';

export interface LifecycleEvent {
  kind: LifecycleKind;
  description: string;       // human description
  trigger: string;           // what triggers it (event name, path, schedule)
  handler?: string;          // file:handler if known
}

export interface AntiPurpose {
  notInScope: string;        // e.g. "No frontend"
  reason: string;            // how we know
}

/* ---- where-to-look concept map ---- */

export interface ConceptLocation {
  concept: string;           // e.g. "Authentication"
  description: string;       // human-friendly explanation
  files: string[];           // matching file paths (capped to ~5)
  detected: boolean;         // false → "(not in this codebase)"
}

/* ---- configuration maturity ---- */

export interface EnvVarMaturity {
  name: string;
  required: boolean;         // no fallback default detected
  defaultValue: string | null; // extracted literal default if present
  files: string[];
  riskHint: string;          // human-friendly "what breaks if missing"
}

/* ---- frontend-specific orientation ---- */

export interface FrontendRoute {
  path: string;              // e.g. "/dashboard/:id"
  componentRef?: string;     // e.g. "DashboardPage"
  file: string;
}

export interface FrontendStateStore {
  kind: 'zustand' | 'redux' | 'context' | 'recoil' | 'jotai' | 'mobx' | 'unknown';
  name?: string;             // store/slice/context name when extractable
  file: string;
}

export interface FrontendInfo {
  detected: boolean;         // whether we think this repo has a frontend
  framework: 'react' | 'next' | 'remix' | 'vite-react' | 'svelte' | 'vue' | null;
  routerLib: string | null;  // 'react-router' | 'next-app' | 'next-pages' | 'tanstack-router' | null
  routes: FrontendRoute[];
  componentCount: number;
  pageCount: number;
  customHooks: string[];     // names of files like useFoo.ts that export a hook
  stateStores: FrontendStateStore[];
  stylingApproach: string[]; // 'CSS Modules' | 'Tailwind' | 'styled-components' | 'SCSS' | etc.
}

export interface AnalysisResult {
  project: ProjectInfo;
  files: Map<string, FileNode>;
  subsystems: Subsystem[];
  entryPoints: EntryPoint[];
  riskAreas: RiskArea[];
  contracts: ImplicitContract[];
  databases: DatabaseConnection[];
  externalServices: ExternalService[];
  routes: RouteEndpoint[];
  techStack: TechStack;
  deployment: DeploymentInfo;
  docs: ProjectDoc[];
  swagger: SwaggerInfo;
  /* ---- orientation extensions ---- */
  gitHeatmap: GitHeatmap;
  glossary: GlossaryTerm[];
  happyPath: HappyPath | null;
  folderPurposes: FolderPurpose[];
  stateSurfaces: StateSurface[];
  conventions: Convention[];
  readingPaths: ReadingPath[];
  externalContracts: ExternalContract[];
  lifecycleEvents: LifecycleEvent[];
  antiPurposes: AntiPurpose[];
  frontend: FrontendInfo;
  whereToLook: ConceptLocation[];
  envMaturity: EnvVarMaturity[];
  capabilities: CapabilitySet;
  /* -------------------------------- */
  stats: {
    totalFiles: number;
    totalLoc: number;
    parseFailures: number;
  };
}

export interface ParseResult {
  ast: ASTFile;
  content: string;
}
