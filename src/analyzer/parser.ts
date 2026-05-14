import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import type { ParseResult } from '../types';

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

export function parseFile(rootDir: string, relativePath: string): ParseResult | null {
  const fullPath = path.join(rootDir, relativePath);
  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }

  const ext = path.extname(relativePath).toLowerCase();
  const isTS = TS_EXTENSIONS.has(ext);
  const hasJSX = ext === '.tsx' || ext === '.jsx';

  const plugins: any[] = ['decorators-legacy'];
  if (isTS) plugins.push('typescript');
  if (hasJSX || !isTS) plugins.push('jsx');

  try {
    const ast = parse(content, {
      sourceType: 'unambiguous',
      plugins,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowUndeclaredExports: true,
    });
    return { ast, content };
  } catch {
    return null;
  }
}
