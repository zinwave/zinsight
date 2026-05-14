import type { GlossaryTerm, ModelSchema, RouteEndpoint, Subsystem, FileNode } from '../types';
/**
 * Build a domain glossary from the analysis output. Pure heuristics — picks
 * up entity names, primary route resources, service classes, and well-known
 * roles. Definitions are inferred from where the term lives.
 */
export declare function buildGlossary(input: {
    models: ModelSchema[];
    routes: RouteEndpoint[];
    subsystems: Subsystem[];
    files: Map<string, FileNode>;
}): GlossaryTerm[];
//# sourceMappingURL=glossary.d.ts.map