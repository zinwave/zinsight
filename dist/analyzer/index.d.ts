import type { AnalysisResult } from '../types';
interface ProgressCallback {
    (message: string): void;
}
export declare function analyze(rootDir: string, onProgress?: ProgressCallback): AnalysisResult;
export {};
//# sourceMappingURL=index.d.ts.map