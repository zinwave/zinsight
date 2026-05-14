import type { File as ASTFile } from '@babel/types';
import type { FolderPurpose, StateSurface, Convention, ReadingPath, ExternalContract, ExternalService, LifecycleEvent, AntiPurpose, Subsystem, RouteEndpoint, FileNode, DatabaseConnection, ImplicitContract } from '../types';
export declare function inferFolderPurposes(input: {
    subsystems: Subsystem[];
    routes: RouteEndpoint[];
    databases: DatabaseConnection[];
    files: Map<string, FileNode>;
    rootDir: string;
}): FolderPurpose[];
export declare function buildStateMap(input: {
    databases: DatabaseConnection[];
    envContracts: ImplicitContract[];
    asts: Map<string, ASTFile | null>;
    contentMap: Map<string, string>;
    rootDir: string;
}): StateSurface[];
export declare function detectConventions(input: {
    subsystems: Subsystem[];
    routes: RouteEndpoint[];
    databases: DatabaseConnection[];
    files: Map<string, FileNode>;
    contentMap: Map<string, string>;
}): Convention[];
export declare function buildReadingPaths(input: {
    subsystems: Subsystem[];
    routes: RouteEndpoint[];
    databases: DatabaseConnection[];
    files: Map<string, FileNode>;
    entryPoints: {
        label: string;
        filePath: string;
    }[];
}): ReadingPath[];
export declare function buildExternalContracts(input: {
    externalServices: ExternalService[];
    routes: RouteEndpoint[];
    contentMap: Map<string, string>;
}): ExternalContract[];
export declare function detectLifecycleEvents(input: {
    routes: RouteEndpoint[];
    asts: Map<string, ASTFile | null>;
    contentMap: Map<string, string>;
    entryPoints: {
        label: string;
        filePath: string;
    }[];
}): LifecycleEvent[];
export declare function inferAntiPurposes(input: {
    rootDir: string;
    files: Map<string, FileNode>;
    routes: RouteEndpoint[];
    databases: DatabaseConnection[];
    externalServices: ExternalService[];
    contentMap: Map<string, string>;
}): AntiPurpose[];
//# sourceMappingURL=orientation.d.ts.map