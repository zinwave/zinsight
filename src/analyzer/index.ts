import * as fs from 'fs';
import * as path from 'path';
import type { File as ASTFile } from '@babel/types';
import type { AnalysisResult, ProjectInfo, RiskArea, ParseResult } from '../types';
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

export function analyze(rootDir: string, onProgress?: ProgressCallback): AnalysisResult {
  const log = onProgress || (() => {});

  // 1. Read project info
  log('Reading project info...');
  const project = readProjectInfo(rootDir);

  // 2. Discover files
  log('Discovering files...');
  const filePaths = discoverFiles(rootDir);
  log(`Found ${filePaths.length} files`);

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
  const techStack = detectTechStack(rootDir, filePaths, actualDbTypes);

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

  // 26. Anti-purpose (what this repo is NOT)
  log('Inferring out-of-scope characteristics...');
  const antiPurposes = inferAntiPurposes({
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
  const frontend = analyzeFrontend({
    rootDir,
    files: filePaths,
    asts: astMap,
    contentMap,
    packageDeps: packageDepsSet,
  });

  // 28. Where to Look — concept-to-path map
  log('Building "where to look" concept map...');
  const whereToLook = buildWhereToLook({
    files: fileNodes,
    contentMap,
    allFilePaths: filePaths,
  });

  // 29. Configuration maturity (required vs optional env vars + risk hints)
  log('Assessing configuration maturity...');
  const envMaturity = buildEnvMaturity({ envContracts, contentMap });

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

function readProjectInfo(rootDir: string): ProjectInfo {
  const pkgPath = path.join(rootDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return {
      name: pkg.name || path.basename(rootDir),
      version: pkg.version || '0.0.0',
      description: pkg.description || '',
    };
  } catch {
    return {
      name: path.basename(rootDir),
      version: '0.0.0',
      description: '',
    };
  }
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
