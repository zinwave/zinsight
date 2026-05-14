import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { ProjectDoc } from '../types';

const DOC_PATTERNS = [
  'README.md', 'README.txt', 'README',
  'SECURITY.md', 'SECURITY.txt',
  'CONTRIBUTING.md', 'CONTRIBUTING.txt',
  'CHANGELOG.md', 'CHANGELOG.txt', 'CHANGES.md', 'HISTORY.md',
  'LICENSE.md', 'LICENSE.txt', 'LICENSE',
  'CODE_OF_CONDUCT.md',
  'ARCHITECTURE.md',
  'DEPLOYMENT.md', 'DEPLOY.md',
  'API.md', 'DEVELOPMENT.md',
  'docs/README.md', 'docs/*.md',
];

const TYPE_MAP: Record<string, ProjectDoc['type']> = {
  readme: 'readme',
  security: 'security',
  contributing: 'contributing',
  changelog: 'changelog',
  changes: 'changelog',
  history: 'changelog',
  license: 'license',
};

export function detectDocs(rootDir: string): ProjectDoc[] {
  const docs: ProjectDoc[] = [];
  const seen = new Set<string>();

  for (const pattern of DOC_PATTERNS) {
    const matches = glob.sync(pattern, {
      cwd: rootDir,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });

    for (const match of matches) {
      if (seen.has(match)) continue;
      seen.add(match);

      const fullPath = path.join(rootDir, match);
      const content = safeReadFile(fullPath);
      if (!content || content.length < 10) continue;

      // Skip the ARCHITECTURE.md we generate
      const basename = path.basename(match).toLowerCase();
      if (basename === 'architecture.md') continue;

      const doc = parseDoc(match, content);
      if (doc) docs.push(doc);
    }
  }

  return docs;
}

function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function classifyDoc(filePath: string): ProjectDoc['type'] {
  const basename = path.basename(filePath).toLowerCase().replace(/\.(md|txt)$/, '');
  return TYPE_MAP[basename] || 'other';
}

function parseDoc(filePath: string, content: string): ProjectDoc | null {
  const lines = content.split('\n');
  const headings: string[] = [];
  let title = '';
  let summary = '';
  let foundFirstContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract headings
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      const heading = headingMatch[1].replace(/[#*`]/g, '').trim();
      if (!title) {
        title = heading;
      } else {
        headings.push(heading);
      }
      continue;
    }

    // Get first meaningful paragraph as summary
    if (!foundFirstContent && title && !trimmed.startsWith('![') && !trimmed.startsWith('<') && !trimmed.startsWith('---') && trimmed.length > 10) {
      // Skip badges, HTML, and horizontal rules
      summary = trimmed
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // strip markdown links
        .replace(/[*_`]/g, '')                      // strip formatting
        .slice(0, 200);
      foundFirstContent = true;
    }

    // Limit heading extraction
    if (headings.length >= 20) break;
  }

  if (!title) {
    // Use filename as title
    title = path.basename(filePath).replace(/\.(md|txt)$/, '');
  }

  return {
    path: filePath,
    type: classifyDoc(filePath),
    title,
    summary,
    headings: headings.slice(0, 15),
  };
}
