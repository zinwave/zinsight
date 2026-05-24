import type { TechStack } from '../types';
export declare function detectTechStack(rootDir: string, knownFiles: string[], actualDbTypes?: Set<string>, detectedLanguage?: 'js-ts' | 'php' | 'python' | 'go' | 'java' | 'ruby' | 'rust' | 'terraform' | 'unknown'): TechStack;
export declare function getAllDeps(rootDir: string): Record<string, string>;
//# sourceMappingURL=tech-stack.d.ts.map