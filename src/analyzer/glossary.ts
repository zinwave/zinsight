import type {
  GlossaryTerm,
  ModelSchema,
  RouteEndpoint,
  Subsystem,
  FileNode,
} from '../types';

/**
 * Build a domain glossary from the analysis output. Pure heuristics — picks
 * up entity names, primary route resources, service classes, and well-known
 * roles. Definitions are inferred from where the term lives.
 */
export function buildGlossary(input: {
  models: ModelSchema[];
  routes: RouteEndpoint[];
  subsystems: Subsystem[];
  files: Map<string, FileNode>;
}): GlossaryTerm[] {
  const terms = new Map<string, GlossaryTerm>();

  // 1. Entity terms from schemas (most authoritative source of domain vocabulary)
  for (const model of input.models) {
    if (!model.name) continue;
    const fieldCount = model.fields.length;
    const fkRefs = model.fields.filter((f) => f.ref).map((f) => f.ref!);
    const definition = composeEntityDefinition(model.name, fieldCount, fkRefs);
    upsert(terms, {
      term: model.name,
      kind: 'entity',
      definition,
      source: model.file,
    });
  }

  // 2. Route resources — top-level path segments that aren't params
  const routeResources = new Map<string, { count: number; sample: string }>();
  for (const route of input.routes) {
    const segs = route.path.split('/').filter(Boolean);
    const top = segs[0];
    if (!top || top.startsWith(':') || top.startsWith('{')) continue;
    const existing = routeResources.get(top);
    if (existing) {
      existing.count += 1;
    } else {
      routeResources.set(top, { count: 1, sample: route.path });
    }
  }
  for (const [resource, data] of routeResources) {
    if (terms.has(normalize(resource))) continue; // already covered by entity
    upsert(terms, {
      term: titleCase(resource),
      kind: 'route',
      definition: `HTTP resource at \`/${resource}\` (${data.count} endpoint${data.count === 1 ? '' : 's'}). Sample: \`${data.sample}\`.`,
      source: routeFileFor(resource, input.routes),
    });
  }

  // 3. Service classes — files named *Service / *.service.ts that export a class
  for (const [fp] of input.files) {
    const isServiceFile = /[\\/.]service\.(t|j)sx?$/.test(fp);
    if (!isServiceFile) continue;
    const className = serviceClassName(fp);
    if (!className) continue;
    if (terms.has(normalize(className))) continue;
    upsert(terms, {
      term: className,
      kind: 'service',
      definition: 'Service class — encapsulates business logic for one feature area.',
      source: fp,
    });
  }

  // 4. Well-known roles found in @Roles() decorators or strings
  const ROLE_TOKENS = new Set(['admin', 'manager', 'owner', 'member', 'user', 'guest', 'editor', 'viewer']);
  const rolesFound = new Set<string>();
  for (const route of input.routes) {
    if (!route.guards) continue;
    for (const guard of route.guards) {
      const matches = guard.match(/['"]([a-zA-Z]+)['"]/g) || [];
      for (const m of matches) {
        const stripped = m.replace(/['"]/g, '').toLowerCase();
        if (ROLE_TOKENS.has(stripped)) rolesFound.add(stripped);
      }
    }
  }
  for (const role of rolesFound) {
    upsert(terms, {
      term: titleCase(role),
      kind: 'role',
      definition: `Authorization role used in route guards (\`@Roles('${role}')\`).`,
      source: '(detected via guard decorators)',
    });
  }

  // 5. Compound concepts — entity names that look like multi-word domain terms
  // (e.g. "PeopleSignal", "OneOnOne", "FeedbackTemplate"). These often need
  // a hint that they're project-specific jargon, not standard terms.
  for (const model of input.models) {
    if (!model.name) continue;
    if (isLikelyDomainJargon(model.name)) {
      const existing = terms.get(normalize(model.name));
      if (existing && !existing.definition.includes('domain-specific')) {
        existing.definition = `${existing.definition} (Domain-specific term — not a generic word.)`;
      }
    }
  }

  // Sort: entities first (most important), then routes, services, roles
  const order: Record<string, number> = { entity: 0, route: 1, service: 2, role: 3, concept: 4 };
  return [...terms.values()].sort((a, b) => {
    const k = order[a.kind] - order[b.kind];
    if (k !== 0) return k;
    return a.term.localeCompare(b.term);
  });
}

/* ------------------------------- helpers ------------------------------- */

function upsert(map: Map<string, GlossaryTerm>, term: GlossaryTerm): void {
  const key = normalize(term.term);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, term);
    return;
  }
  // Prefer more authoritative kinds
  const order: Record<string, number> = { entity: 0, route: 1, service: 2, role: 3, concept: 4 };
  if (order[term.kind] < order[existing.kind]) {
    map.set(key, term);
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function composeEntityDefinition(name: string, fieldCount: number, fkRefs: string[]): string {
  const refList = [...new Set(fkRefs)].slice(0, 3);
  let def = `Domain entity (${fieldCount} field${fieldCount === 1 ? '' : 's'})`;
  if (refList.length > 0) {
    def += `, links to ${refList.join(', ')}`;
  }
  def += '.';
  return def;
}

function serviceClassName(filePath: string): string | null {
  // `users/users.service.ts` -> `UsersService`
  const basename = filePath.split('/').pop() || '';
  const m = basename.match(/^(.+?)\.service\.(t|j)sx?$/);
  if (!m) return null;
  const stem = m[1];
  if (!stem) return null;
  return stem
    .split(/[-_.]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('') + 'Service';
}

function routeFileFor(resource: string, routes: RouteEndpoint[]): string {
  const r = routes.find((rt) => rt.path.startsWith(`/${resource}`));
  return r ? r.file : '(routes)';
}

function isLikelyDomainJargon(name: string): boolean {
  // Heuristic: PascalCase with two or more "humps" but not a common technical term.
  const COMMON = new Set([
    'AuthUser', 'AuthSlack', 'AuthZoom', 'AuthAtlassian',
    'OrganizationSchema', 'UserSchema',
  ]);
  if (COMMON.has(name)) return false;
  const humps = (name.match(/[A-Z][a-z]+/g) || []).length;
  return humps >= 2;
}
