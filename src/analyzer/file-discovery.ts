// `fast-glob` replaces the older `glob` package because `glob@10` pulls in
// `foreground-child` → `cross-spawn` → `child_process`, which Socket flags
// as "Shell access" on the published npm package. fast-glob is pure JS
// (deps: @nodelib/fs.* + micromatch + glob-parent + merge2) and offers the
// same pattern semantics for our use cases.
import fg from 'fast-glob';
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
  // Tool/runtime config files frequently contain `process.env.X` references
  // but don't represent application logic — keep them out of the file graph.
  '**/dev-docker-related/**',
  '**/.serverless/**',
];

export function discoverFiles(rootDir: string): string[] {
  const pattern = path.join('**', EXTENSIONS);
  const files = fg.sync(pattern, {
    cwd: rootDir,
    ignore: IGNORE_PATTERNS,
    absolute: false,
    onlyFiles: true, // fast-glob equivalent of glob's `nodir: true`
  });
  return files.sort();
}
