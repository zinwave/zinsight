import * as fs from 'fs';
import * as path from 'path';

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const INDEX_FILES = RESOLVE_EXTENSIONS.map(ext => `index${ext}`);

export function resolveImport(
  fromFile: string,
  importSpecifier: string,
  rootDir: string
): string | null {
  // Skip bare specifiers (npm packages)
  if (!importSpecifier.startsWith('.') && !importSpecifier.startsWith('/')) {
    return null;
  }

  const fromDir = path.dirname(path.join(rootDir, fromFile));
  const resolved = path.resolve(fromDir, importSpecifier);
  const relative = path.relative(rootDir, resolved);

  // Try exact match
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return relative;
  }

  // Try with extensions
  for (const ext of RESOLVE_EXTENSIONS) {
    const withExt = resolved + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return path.relative(rootDir, withExt);
    }
  }

  // Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const withIndex = path.join(resolved, indexFile);
    if (fs.existsSync(withIndex) && fs.statSync(withIndex).isFile()) {
      return path.relative(rootDir, withIndex);
    }
  }

  return null;
}
