import type { ConceptLocation, EnvVarMaturity, FileNode, ImplicitContract } from '../types';
export declare function buildWhereToLook(input: {
    files: Map<string, FileNode>;
    contentMap: Map<string, string>;
    allFilePaths: string[];
}): ConceptLocation[];
export declare function buildEnvMaturity(input: {
    envContracts: ImplicitContract[];
    contentMap: Map<string, string>;
}): EnvVarMaturity[];
//# sourceMappingURL=where-to-look.d.ts.map