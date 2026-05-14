import type { File as ASTFile } from '@babel/types';
import type { FrontendInfo } from '../types';
/**
 * Frontend orientation pass.
 * Pure heuristics: file shapes (.tsx/.jsx), framework deps in package.json,
 * AST patterns for React Router routes, Zustand/Redux/Context stores, custom
 * hooks (files exporting `useXxx`), and styling conventions.
 */
export declare function analyzeFrontend(input: {
    rootDir: string;
    files: string[];
    asts: Map<string, ASTFile | null>;
    contentMap: Map<string, string>;
    packageDeps: Set<string>;
}): FrontendInfo;
//# sourceMappingURL=frontend.d.ts.map