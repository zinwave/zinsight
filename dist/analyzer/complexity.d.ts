import type { File as ASTFile } from '@babel/types';
export interface ComplexityResult {
    complexity: number;
    maxNestingDepth: number;
}
export declare function computeComplexity(ast: ASTFile): ComplexityResult;
//# sourceMappingURL=complexity.d.ts.map