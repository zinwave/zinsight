import type { File as ASTFile } from '@babel/types';
import traverse from '@babel/traverse';
import type {
  HappyPath,
  HappyPathStep,
  RouteEndpoint,
  FileNode,
  DatabaseConnection,
  ExternalService,
} from '../types';

/**
 * Pick a representative endpoint and trace through the request lifecycle as
 * a step-by-step narrative. The chosen endpoint biases toward GET on a
 * resource that's read often (large in-degree on its handler file), with a
 * fallback to the first route in the largest controller.
 */
export function buildHappyPath(input: {
  routes: RouteEndpoint[];
  files: Map<string, FileNode>;
  asts: Map<string, ASTFile | null>;
  databases: DatabaseConnection[];
  externalServices: ExternalService[];
  rootDir: string;
}): HappyPath | null {
  const { routes, files, asts } = input;

  // Skip Walking Through One Request for trivial repos. A 1-route hello-world
  // produces a canned 4-step narrative that adds no value. Require either
  // ≥3 endpoints OR a substantive handler (has a service file + ≥10 LOC).
  const routableRoutes = routes.filter((r) => r.method !== 'USE');
  if (routableRoutes.length === 0) return null;
  if (routableRoutes.length < 3) {
    // Allow only when the candidate handler is non-trivial — service file
    // exists OR controller file has meaningful body length.
    const c = pickRepresentativeRoute(routableRoutes, files);
    if (!c) return null;
    const node = files.get(c.file);
    const ctrlLoc = node?.loc ?? 0;
    const hasService = !!c.file && [...files.keys()].some((f) => f === c.file.replace(/\.controller\./, '.service.'));
    if (!hasService && ctrlLoc < 20) return null;
  }

  const candidate = pickRepresentativeRoute(routableRoutes, files);
  if (!candidate) return null;

  const steps: HappyPathStep[] = [];

  // Step 1: client → server
  steps.push({
    label: `Client sends ${candidate.method} ${candidate.path}`,
  });

  // Step 2: middleware (if detected)
  const middleware = detectMiddleware(asts);
  if (middleware.length > 0) {
    steps.push({
      label: `Middleware runs: ${middleware.slice(0, 3).join(', ')}`,
      file: middleware[0]?.includes(':') ? middleware[0]?.split(':')[0] : undefined,
      details: 'Session/CORS/logging applied to every request before guards.',
    });
  }

  // Step 3: guards
  const guards = candidate.guards && candidate.guards.length > 0
    ? candidate.guards
    : (candidate.isPublic ? ['(@Public — no auth required)'] : []);
  if (guards.length > 0) {
    steps.push({
      label: `Guards check access: ${guards.join(' → ')}`,
      details: candidate.isPublic
        ? 'This endpoint is explicitly public.'
        : 'Each guard returns true or throws 401/403.',
    });
  }

  // Step 4: controller method
  steps.push({
    label: `Controller \`${candidate.handler}()\` is invoked`,
    file: candidate.file,
    details: `Defined in ${candidate.file}.`,
  });

  // Step 5: service call (best-effort lookup)
  const serviceFile = guessServiceFile(candidate.file, files);
  if (serviceFile) {
    const serviceMethod = guessServiceMethod(candidate.handler);
    steps.push({
      label: `Service \`${serviceMethod}()\` runs business logic`,
      file: serviceFile,
      details: 'Controller delegates to the matching service; data validation and authorization checks live here.',
    });
  }

  // Step 6: database / external
  const callsDb = detectsDbCallInFile(serviceFile || candidate.file, asts);
  if (callsDb && input.databases.length > 0) {
    const dbType = input.databases[0].type;
    steps.push({
      label: `Reads/writes ${dbType.toUpperCase()}`,
      details: `Scoped query (typically by orgId) against the \`${guessCollectionName(candidate.path)}\` collection.`,
    });
  }

  const callsExternal = detectsExternalCallInFile(serviceFile || candidate.file, asts);
  if (callsExternal && input.externalServices.length > 0) {
    steps.push({
      label: `(Optional) Calls external service`,
      details: `${input.externalServices[0].label} or similar — only when the route requires it.`,
    });
  }

  // Step 7: response
  steps.push({
    label: `Response returned to client (JSON)`,
    details: 'NestJS / Express serializes the service return value.',
  });

  return {
    endpoint: `${candidate.method} ${candidate.path}`,
    rationale: candidate.rationale,
    steps,
  };
}

/* ----------------------------- pickers --------------------------------- */

function pickRepresentativeRoute(
  routes: RouteEndpoint[],
  files: Map<string, FileNode>,
): (RouteEndpoint & { rationale: string }) | null {
  // Count endpoints per controller file — the file with the most routes is
  // usually a central feature controller (a better representative than a
  // tiny one-route controller).
  const endpointsByFile = new Map<string, number>();
  for (const r of routes) {
    endpointsByFile.set(r.file, (endpointsByFile.get(r.file) || 0) + 1);
  }

  // Prefer a GET on a resource-detail path (e.g. `/things/:id`) within the
  // file with the most endpoints — that's the canonical "fetch by id" read.
  const scored = routes
    .filter((r) => r.method.toUpperCase() === 'GET')
    .map((r) => {
      const fileEndpoints = endpointsByFile.get(r.file) || 1;
      const pathDepth = r.path.split('/').filter(Boolean).length;
      const hasIdParam = /:\w+|\{[\w]+\}/.test(r.path);
      const isPublic = r.isPublic ? 1 : 0;
      // Score:
      //  + more endpoints in same file → more central feature
      //  + has an :id param → "fetch by id" pattern (most representative read)
      //  - deeper path → less canonical
      //  - public routes are often health/oauth — penalize slightly
      const score = fileEndpoints * 5 + (hasIdParam ? 8 : 0) - pathDepth - isPublic * 4;
      return { route: r, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const best = scored[0].route;
    const fileEndpoints = endpointsByFile.get(best.file) || 1;
    return {
      ...best,
      rationale: `Picked from the ${best.file.split('/').pop()} (${fileEndpoints} endpoints in that file) — typical read-by-id path through the system.`,
    };
  }

  // Fallback: any route
  return {
    ...routes[0],
    rationale: 'Representative route (first available endpoint).',
  };
}

/* ---------------------------- detectors -------------------------------- */

function detectMiddleware(asts: Map<string, ASTFile | null>): string[] {
  const out: string[] = [];
  for (const [fp, ast] of asts) {
    if (!ast) continue;
    if (!/middleware/i.test(fp) && !/main\.(t|j)sx?$/.test(fp)) continue;

    let foundUse = false;
    let middlewareName: string | null = null;
    traverse(ast, {
      CallExpression(p) {
        const callee: any = p.node.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.name === 'use'
        ) {
          foundUse = true;
        }
      },
      ClassDeclaration(p) {
        const id = p.node.id?.name;
        if (id && /middleware/i.test(id)) middlewareName = id;
      },
    });
    if (foundUse || middlewareName) {
      out.push(`${middlewareName || basename(fp)}`);
    }
  }
  return [...new Set(out)];
}

function guessServiceFile(controllerFile: string, files: Map<string, FileNode>): string | null {
  const candidate = controllerFile.replace(/\.controller\.(t|j)sx?$/, (_m, ext) => `.service.${ext}`);
  if (files.has(candidate)) return candidate;
  // Try same directory
  const dir = controllerFile.substring(0, controllerFile.lastIndexOf('/'));
  for (const fp of files.keys()) {
    if (fp.startsWith(dir + '/') && /\.service\.(t|j)sx?$/.test(fp)) return fp;
  }
  return null;
}

function guessServiceMethod(handler: string): string {
  // map controller method names to typical service method names; usually identical
  return handler;
}

function guessCollectionName(routePath: string): string {
  const segs = routePath.split('/').filter(Boolean);
  const top = segs[0] || 'data';
  return top.replace(/-/g, '_');
}

function detectsDbCallInFile(file: string | null, asts: Map<string, ASTFile | null>): boolean {
  if (!file) return false;
  const ast = asts.get(file);
  if (!ast) return false;
  let found = false;
  traverse(ast, {
    CallExpression(p) {
      const callee: any = p.node.callee;
      if (callee?.type !== 'MemberExpression') return;
      const name = callee.property?.name;
      if (!name) return;
      if (
        name === 'find' ||
        name === 'findOne' ||
        name === 'findOneAndUpdate' ||
        name === 'updateOne' ||
        name === 'updateMany' ||
        name === 'deleteOne' ||
        name === 'deleteMany' ||
        name === 'insertMany' ||
        name === 'create' ||
        name === 'aggregate' ||
        name === 'query'
      ) {
        found = true;
        p.stop();
      }
    },
  });
  return found;
}

function detectsExternalCallInFile(file: string | null, asts: Map<string, ASTFile | null>): boolean {
  if (!file) return false;
  const ast = asts.get(file);
  if (!ast) return false;
  let found = false;
  traverse(ast, {
    CallExpression(p) {
      const callee: any = p.node.callee;
      if (callee?.type === 'Identifier' && (callee.name === 'fetch' || callee.name === 'axios')) {
        found = true;
        p.stop();
        return;
      }
      if (callee?.type === 'MemberExpression') {
        const name = callee.property?.name;
        if (name === 'request' || name === 'get' || name === 'post' || name === 'put' || name === 'delete') {
          // Heuristic: only count if the object name suggests HTTP, e.g. http, axios, fetch, request
          const obj: any = callee.object;
          const objName = obj?.name || obj?.property?.name || '';
          if (/^(http|axios|fetch|request|got|api)$/i.test(objName)) {
            found = true;
            p.stop();
          }
        }
      }
    },
  });
  return found;
}

function basename(p: string): string {
  return p.split('/').pop() || p;
}
