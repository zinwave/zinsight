import * as path from 'path';
import type { FileNode, Subsystem } from '../types';

// Directory names that are operational/supporting, not domain features.
// Used by the renderer to demote them to a "Operational code" footnote
// instead of rendering them alongside real feature modules in the
// architecture diagram and modules table.
export const PERIPHERAL_DIRS = new Set([
  'scripts',
  'script',
  'migrations',
  'migration',
  'seeds',
  'seed',
  'fixtures',
  'fixture',
  'tools',
  'tooling',
  'bin',
  'examples',
  'example',
  'samples',
  'demo',
  'demos',
  'dev-docker-related',
  'docker',
]);

export function isPeripheralModule(name: string): boolean {
  return PERIPHERAL_DIRS.has(name.toLowerCase());
}

export function detectSubsystems(files: Map<string, FileNode>): Subsystem[] {
  // Group files by their top-level directory
  const groups = new Map<string, string[]>();

  // Find the src/ directory index in paths — it may be nested (e.g. code/src/)
  const srcDirs = new Set(['src', 'lib', 'app']);

  for (const filePath of files.keys()) {
    const parts = filePath.split(path.sep);
    let groupName: string;

    // Find the src/lib/app directory at any depth and use the next level as the module
    let srcIndex = -1;
    for (let i = 0; i < parts.length; i++) {
      if (srcDirs.has(parts[i])) {
        srcIndex = i;
        break;
      }
    }

    if (srcIndex >= 0 && parts.length > srcIndex + 2) {
      // File is inside src/ (or lib/app) with a subdirectory — use subdirectory as module
      groupName = parts[srcIndex + 1];
    } else if (srcIndex >= 0 && parts.length === srcIndex + 2) {
      // File is directly inside src/ (e.g. src/main.ts) — group as "src"
      groupName = parts[srcIndex];
    } else if (parts.length > 1) {
      groupName = parts[0];
    } else {
      groupName = '(root)';
    }

    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(filePath);
  }

  const subsystems: Subsystem[] = [];

  for (const [name, groupFiles] of groups) {
    const fileSet = new Set(groupFiles);
    let internalDeps = 0;
    let externalDeps = 0;
    const publicApi: string[] = [];

    for (const fp of groupFiles) {
      const node = files.get(fp)!;

      // Count internal vs external deps
      for (const dep of node.imports) {
        if (fileSet.has(dep)) {
          internalDeps++;
        } else {
          externalDeps++;
        }
      }

      // If any file outside this subsystem imports this file, it's part of the public API
      for (const importer of node.importedBy) {
        if (!fileSet.has(importer)) {
          publicApi.push(fp);
          break;
        }
      }
    }

    subsystems.push({
      name,
      files: groupFiles.sort(),
      publicApi: [...new Set(publicApi)].sort(),
      internalDeps,
      externalDeps,
    });
  }

  return subsystems.sort((a, b) => b.files.length - a.files.length);
}
