import type { File as ASTFile } from '@babel/types';
import type { FileNode } from '../types';
export declare function buildDependencyGraph(files: Map<string, {
    ast: ASTFile;
    content: string;
} | null>, rootDir: string): Map<string, FileNode>;
//# sourceMappingURL=dependency-graph.d.ts.map