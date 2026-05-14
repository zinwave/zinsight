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
exports.analyze = analyze;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const file_discovery_1 = require("./file-discovery");
const parser_1 = require("./parser");
const dependency_graph_1 = require("./dependency-graph");
const complexity_1 = require("./complexity");
const entry_points_1 = require("./entry-points");
const subsystems_1 = require("./subsystems");
const contracts_1 = require("./contracts");
const database_1 = require("./database");
const external_services_1 = require("./external-services");
const routes_1 = require("./routes");
const tech_stack_1 = require("./tech-stack");
const deployment_1 = require("./deployment");
const swagger_1 = require("./swagger");
const docs_1 = require("./docs");
const git_heatmap_1 = require("./git-heatmap");
const glossary_1 = require("./glossary");
const happy_path_1 = require("./happy-path");
const orientation_1 = require("./orientation");
const frontend_1 = require("./frontend");
const where_to_look_1 = require("./where-to-look");
function analyze(rootDir, onProgress) {
    const log = onProgress || (() => { });
    // 1. Read project info
    log('Reading project info...');
    const project = readProjectInfo(rootDir);
    // 2. Discover files
    log('Discovering files...');
    const filePaths = (0, file_discovery_1.discoverFiles)(rootDir);
    log(`Found ${filePaths.length} files`);
    // 3. Parse all files
    log('Parsing files...');
    const parsed = new Map();
    let parseFailures = 0;
    for (const fp of filePaths) {
        const result = (0, parser_1.parseFile)(rootDir, fp);
        parsed.set(fp, result);
        if (!result)
            parseFailures++;
    }
    log(`Parsed ${filePaths.length - parseFailures} files (${parseFailures} skipped)`);
    // 4. Build dependency graph
    log('Building dependency graph...');
    const fileNodes = (0, dependency_graph_1.buildDependencyGraph)(parsed, rootDir);
    // 5. Compute complexity
    log('Computing complexity scores...');
    for (const [fp, result] of parsed) {
        if (!result)
            continue;
        const node = fileNodes.get(fp);
        if (!node)
            continue;
        const { complexity, maxNestingDepth } = (0, complexity_1.computeComplexity)(result.ast);
        node.complexity = complexity;
        node.maxNestingDepth = maxNestingDepth;
    }
    // 6. Detect entry points
    log('Detecting entry points...');
    const entryPoints = (0, entry_points_1.detectEntryPoints)(rootDir, filePaths);
    // 7. Detect subsystems
    log('Detecting subsystems...');
    const subsystems = (0, subsystems_1.detectSubsystems)(fileNodes);
    // 8. Scan contracts
    log('Scanning for implicit contracts...');
    const astMap = new Map();
    for (const [fp, result] of parsed) {
        astMap.set(fp, result?.ast || null);
    }
    const contracts = (0, contracts_1.scanContracts)(astMap);
    // 9. Compute risk areas
    log('Identifying risk areas...');
    const riskAreas = computeRiskAreas(fileNodes);
    // 10. Detect databases (before tech stack so we can filter false positives)
    log('Scanning for database connections...');
    const packageDeps = (0, tech_stack_1.getAllDeps)(rootDir);
    const databases = (0, database_1.detectDatabases)(astMap, packageDeps);
    // 11. Detect tech stack (use actual DB types to filter package.json-only deps)
    log('Detecting tech stack...');
    const actualDbTypes = new Set(databases.map(db => db.type));
    const techStack = (0, tech_stack_1.detectTechStack)(rootDir, filePaths, actualDbTypes);
    // 12. Detect external services
    log('Detecting external service integrations...');
    const contentMap = new Map();
    for (const [fp, result] of parsed) {
        if (result)
            contentMap.set(fp, result.content);
    }
    const externalServices = (0, external_services_1.detectExternalServices)(astMap, contentMap);
    // 13. Detect routes
    log('Detecting API routes and endpoints...');
    const routes = (0, routes_1.detectRoutes)(astMap);
    // 14. Detect deployment info (Dockerfiles, docker-compose, CI/CD, k8s)
    log('Scanning for deployment configuration...');
    const deployment = (0, deployment_1.detectDeployment)(rootDir);
    // 15. Detect Swagger/OpenAPI
    log('Checking for API documentation specs...');
    const swagger = (0, swagger_1.detectSwagger)(rootDir, astMap);
    // 16. Detect project docs (README, SECURITY, CONTRIBUTING, etc.)
    log('Scanning project documentation...');
    const docs = (0, docs_1.detectDocs)(rootDir);
    // 17. Git change frequency heatmap (optional — needs git repo)
    log('Reading git history for change frequency...');
    const gitHeatmap = (0, git_heatmap_1.detectGitHeatmap)(rootDir, filePaths);
    // 18. Glossary — domain vocabulary
    log('Building domain glossary...');
    const allModels = databases.flatMap((d) => d.modelSchemas);
    const glossary = (0, glossary_1.buildGlossary)({ models: allModels, routes, subsystems, files: fileNodes });
    // 19. Happy Path — representative request trace
    log('Tracing the happy path...');
    const happyPath = (0, happy_path_1.buildHappyPath)({
        routes,
        files: fileNodes,
        asts: astMap,
        databases,
        externalServices,
        rootDir,
    });
    // 20. Folder purpose inference
    log('Inferring folder purposes...');
    const folderPurposes = (0, orientation_1.inferFolderPurposes)({ subsystems, routes, databases, files: fileNodes, rootDir });
    // 21. State map
    log('Mapping state surfaces...');
    const envContracts = contracts.filter((c) => c.type === 'env-var');
    const stateSurfaces = (0, orientation_1.buildStateMap)({
        databases,
        envContracts,
        asts: astMap,
        contentMap,
        rootDir,
    });
    // 22. Conventions
    log('Detecting code conventions...');
    const conventions = (0, orientation_1.detectConventions)({
        subsystems,
        routes,
        databases,
        files: fileNodes,
        contentMap,
    });
    // 23. Reading paths (scenario-based)
    log('Building scenario-based reading paths...');
    const readingPaths = (0, orientation_1.buildReadingPaths)({
        subsystems,
        routes,
        databases,
        files: fileNodes,
        entryPoints,
    });
    // 24. External contracts
    log('Detailing external contracts...');
    const externalContracts = (0, orientation_1.buildExternalContracts)({ externalServices, routes, contentMap });
    // 25. Lifecycle events
    log('Detecting lifecycle events...');
    const lifecycleEvents = (0, orientation_1.detectLifecycleEvents)({
        routes,
        asts: astMap,
        contentMap,
        entryPoints,
    });
    // 26. Anti-purpose (what this repo is NOT)
    log('Inferring out-of-scope characteristics...');
    const antiPurposes = (0, orientation_1.inferAntiPurposes)({
        rootDir,
        files: fileNodes,
        routes,
        databases,
        externalServices,
        contentMap,
    });
    // 27. Frontend orientation (React Router, hooks, stores, styling)
    log('Detecting frontend characteristics...');
    const packageDepsSet = new Set(Object.keys(packageDeps));
    const frontend = (0, frontend_1.analyzeFrontend)({
        rootDir,
        files: filePaths,
        asts: astMap,
        contentMap,
        packageDeps: packageDepsSet,
    });
    // 28. Where to Look — concept-to-path map
    log('Building "where to look" concept map...');
    const whereToLook = (0, where_to_look_1.buildWhereToLook)({
        files: fileNodes,
        contentMap,
        allFilePaths: filePaths,
    });
    // 29. Configuration maturity (required vs optional env vars + risk hints)
    log('Assessing configuration maturity...');
    const envMaturity = (0, where_to_look_1.buildEnvMaturity)({ envContracts, contentMap });
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
        stats: {
            totalFiles: filePaths.length,
            totalLoc,
            parseFailures,
        },
    };
}
function readProjectInfo(rootDir) {
    const pkgPath = path.join(rootDir, 'package.json');
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        return {
            name: pkg.name || path.basename(rootDir),
            version: pkg.version || '0.0.0',
            description: pkg.description || '',
        };
    }
    catch {
        return {
            name: path.basename(rootDir),
            version: '0.0.0',
            description: '',
        };
    }
}
function computeRiskAreas(files) {
    const risks = [];
    for (const [fp, node] of files) {
        if (node.parseError)
            continue;
        const reasons = [];
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
        if (b.reasons.length !== a.reasons.length)
            return b.reasons.length - a.reasons.length;
        return b.complexity - a.complexity;
    });
}
//# sourceMappingURL=index.js.map