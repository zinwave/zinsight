import type { File as ASTFile } from '@babel/types';
import type { HappyPath, RouteEndpoint, FileNode, DatabaseConnection, ExternalService } from '../types';
/**
 * Pick a representative endpoint and trace through the request lifecycle as
 * a step-by-step narrative. The chosen endpoint biases toward GET on a
 * resource that's read often (large in-degree on its handler file), with a
 * fallback to the first route in the largest controller.
 */
export declare function buildHappyPath(input: {
    routes: RouteEndpoint[];
    files: Map<string, FileNode>;
    asts: Map<string, ASTFile | null>;
    databases: DatabaseConnection[];
    externalServices: ExternalService[];
    rootDir: string;
}): HappyPath | null;
//# sourceMappingURL=happy-path.d.ts.map