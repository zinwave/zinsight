import type { AnalysisResult } from '../types';
interface ProgressCallback {
    (message: string): void;
}
interface AnalyzeOptions {
    /** Override project name (e.g. from `--name` CLI flag). */
    name?: string;
}
export declare function analyze(rootDir: string, onProgress?: ProgressCallback, options?: AnalyzeOptions): AnalysisResult;
export {};
//# sourceMappingURL=index.d.ts.map