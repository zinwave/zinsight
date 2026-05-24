import type { File as ASTFile } from '@babel/types';
export type ProjectKind = 'cli' | 'library' | 'static-site' | 'frontend' | 'backend-server' | 'lambda' | 'fullstack' | 'unknown';
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
    type: string;
    required?: boolean;
    isArray?: boolean;
    isIndex?: boolean;
    isUnique?: boolean;
    isEnum?: boolean;
    defaultValue?: string;
    ref?: string;
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
    guards?: string[];
    isPublic?: boolean;
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
    dockerfiles: {
        path: string;
        baseImage: string;
        exposedPorts: string[];
        stages?: string[];
    }[];
    composeServices: {
        name: string;
        image?: string;
        ports?: string[];
        dependsOn?: string[];
        volumes?: string[];
    }[];
    ciPipelines: {
        path: string;
        tool: string;
        triggers?: string[];
        jobs?: string[];
    }[];
    k8sResources: {
        path: string;
        kind: string;
        name: string;
    }[];
}
export interface ProjectDoc {
    path: string;
    type: 'readme' | 'security' | 'contributing' | 'changelog' | 'license' | 'other';
    title: string;
    summary: string;
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
    uiRoute?: string;
}
export interface GitChangeStat {
    filePath: string;
    changeCount: number;
    authorCount: number;
    authors: string[];
    lastChanged: string | null;
}
export interface GitHeatmap {
    available: boolean;
    windowDays: number;
    files: GitChangeStat[];
}
export type GlossaryKind = 'entity' | 'route' | 'service' | 'role' | 'concept';
export interface GlossaryTerm {
    term: string;
    kind: GlossaryKind;
    definition: string;
    source: string;
}
export interface HappyPathStep {
    label: string;
    file?: string;
    line?: number;
    details?: string;
}
export interface HappyPath {
    endpoint: string;
    rationale: string;
    steps: HappyPathStep[];
}
export interface FolderReadme {
    path: string;
    title: string;
    summary: string;
}
export interface FolderPurpose {
    name: string;
    oneLiner: string;
    readme?: FolderReadme;
}
export interface StateSurface {
    kind: 'database' | 'in-memory-cache' | 'forge-kvs' | 'redis' | 'cookie-session' | 'env-config' | 'file-system';
    description: string;
    files: string[];
}
export interface Convention {
    rule: string;
    evidence: string;
    exceptions?: string[];
}
export interface ReadingPath {
    goal: string;
    files: {
        file: string;
        why: string;
    }[];
    estimatedMinutes: number;
}
export interface ExternalContract {
    service: string;
    direction: 'outbound' | 'inbound' | 'bi-directional';
    endpoints: string[];
    authMethod: string;
    receivedAt?: string[];
    files: string[];
}
export type LifecycleKind = 'app-boot' | 'request-flow' | 'install' | 'uninstall' | 'webhook' | 'scheduled' | 'event-emitter';
export interface LifecycleEvent {
    kind: LifecycleKind;
    description: string;
    trigger: string;
    handler?: string;
}
export interface AntiPurpose {
    notInScope: string;
    reason: string;
}
export interface ConceptLocation {
    concept: string;
    description: string;
    files: string[];
    detected: boolean;
}
export interface EnvVarMaturity {
    name: string;
    required: boolean;
    defaultValue: string | null;
    files: string[];
    riskHint: string;
}
export interface FrontendRoute {
    path: string;
    componentRef?: string;
    file: string;
}
export interface FrontendStateStore {
    kind: 'zustand' | 'redux' | 'context' | 'recoil' | 'jotai' | 'mobx' | 'unknown';
    name?: string;
    file: string;
}
export interface FrontendInfo {
    detected: boolean;
    framework: 'react' | 'next' | 'remix' | 'vite-react' | 'svelte' | 'vue' | null;
    routerLib: string | null;
    routes: FrontendRoute[];
    componentCount: number;
    pageCount: number;
    customHooks: string[];
    stateStores: FrontendStateStore[];
    stylingApproach: string[];
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
//# sourceMappingURL=types.d.ts.map