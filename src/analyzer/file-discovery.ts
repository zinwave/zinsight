import { glob } from 'glob';
import * as path from 'path';

const EXTENSIONS = '*.{js,jsx,ts,tsx,mjs,cjs}';

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/__tests__/**',
  '**/__mocks__/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.d.ts',
  '**/.git/**',
  '**/vendor/**',
  '**/*.min.js',
  '**/*.bundle.js',
];

export function discoverFiles(rootDir: string): string[] {
  const pattern = path.join('**', EXTENSIONS);
  const files = glob.sync(pattern, {
    cwd: rootDir,
    ignore: IGNORE_PATTERNS,
    absolute: false,
    nodir: true,
  });
  return files.sort();
}
