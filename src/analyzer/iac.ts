import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { IaCInfo, IaCTool, IaCFile } from '../types';

const SNIFF_BYTES = 4096;

const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/.terraform/**', '**/.serverless/**', '**/cdk.out/**'];

const TOOL_LABEL: Record<IaCTool, string> = {
  'aws-sam': 'AWS SAM',
  'aws-cloudformation': 'AWS CloudFormation',
  'aws-cdk': 'AWS CDK',
  'aws-serverless-framework': 'Serverless Framework',
  'terraform': 'Terraform',
  'pulumi': 'Pulumi',
  'azure-bicep': 'Azure Bicep',
  'azure-arm': 'Azure ARM',
  'helm': 'Helm',
};

export function iacToolLabel(tool: IaCTool): string {
  return TOOL_LABEL[tool];
}

/**
 * Detect Infrastructure-as-Code tooling in the repo.
 *
 * Two passes:
 *   1. Filename / extension match (cheap, deterministic).
 *   2. Content sniff for ambiguous yaml/json (CloudFormation, SAM, ARM —
 *      authors name these files anything; only the contents identify them).
 *
 * Kubernetes manifests are intentionally not included here — they live in
 * DeploymentInfo.k8sResources, which already parses them.
 */
export function detectIaC(rootDir: string): IaCInfo {
  const files: IaCFile[] = [];
  const seen = new Set<string>();

  const push = (tool: IaCTool, p: string, notes?: string) => {
    const key = `${tool}::${p}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ tool, path: p, notes });
  };

  // ─── Pass 1: filename / extension matching ───

  const tfFiles = glob(rootDir, ['**/*.tf', '**/*.tfvars', '**/terraform.tfstate', '**/.terraform.lock.hcl']);
  for (const f of tfFiles) push('terraform', f);

  const bicepFiles = glob(rootDir, ['**/*.bicep']);
  for (const f of bicepFiles) push('azure-bicep', f);

  // Pulumi: Pulumi.yaml at any depth (one per stack); language-specific code
  // is just regular TS/Python and is parsed elsewhere.
  const pulumiFiles = glob(rootDir, ['**/Pulumi.yaml', '**/Pulumi.yml', '**/Pulumi.*.yaml', '**/Pulumi.*.yml']);
  for (const f of pulumiFiles) push('pulumi', f);

  // AWS CDK: cdk.json at any depth.
  const cdkFiles = glob(rootDir, ['**/cdk.json']);
  for (const f of cdkFiles) push('aws-cdk', f);

  // Serverless Framework
  const slsFiles = glob(rootDir, ['**/serverless.yml', '**/serverless.yaml']);
  for (const f of slsFiles) push('aws-serverless-framework', f);

  // Helm
  const helmFiles = glob(rootDir, ['**/Chart.yaml', '**/Chart.yml']);
  for (const f of helmFiles) push('helm', f);

  // ─── Pass 2: content sniff for yaml/json that could be CF / SAM / ARM ───
  //
  // We scan a small set of common candidate filenames first (the conventional
  // names) and any *.template.yaml / *.template.json. Reading every yaml/json
  // in the repo would be expensive on monorepos.

  const candidatePatterns = [
    // Conventional SAM / CloudFormation filenames at any depth.
    '**/template.yaml', '**/template.yml',
    '**/*template*.yaml', '**/*template*.yml', '**/*template*.json',
    '**/cloudformation*.yaml', '**/cloudformation*.yml', '**/cloudformation*.json',
    '**/cf-*.yaml', '**/cf-*.yml',
    // Conventional infra dirs — any yaml/json inside is worth a sniff.
    '**/infra/**/*.{yaml,yml,json}',
    '**/infrastructure/**/*.{yaml,yml,json}',
    '**/deploy/**/*.{yaml,yml,json}',
    '**/cloudformation/**/*.{yaml,yml,json}',
    '**/sam/**/*.{yaml,yml}',
    '**/arm/**/*.json', '**/azure/**/*.json',
  ];

  const candidates = glob(rootDir, candidatePatterns);
  for (const rel of candidates) {
    const head = readHead(path.join(rootDir, rel));
    if (!head) continue;

    const tool = sniffContent(rel, head);
    if (!tool) continue;

    push(tool, rel);
  }

  const tools = Array.from(new Set(files.map(f => f.tool))).sort();

  return {
    detected: files.length > 0,
    tools,
    files,
  };
}

function sniffContent(relPath: string, head: string): IaCTool | null {
  const isJson = relPath.toLowerCase().endsWith('.json');

  if (isJson) {
    // ARM templates declare a deploymentTemplate schema.
    if (/"\$schema"\s*:\s*"[^"]*deploymentTemplate[^"]*"/i.test(head)) return 'azure-arm';
    // CloudFormation can be JSON too.
    if (/"AWSTemplateFormatVersion"\s*:/.test(head)) {
      if (/"Transform"\s*:\s*"AWS::Serverless[^"]*"/.test(head)) return 'aws-sam';
      return 'aws-cloudformation';
    }
    return null;
  }

  // YAML
  if (/^Transform:\s*AWS::Serverless/m.test(head)) return 'aws-sam';
  if (/^AWSTemplateFormatVersion\s*:/m.test(head)) return 'aws-cloudformation';
  // SAM tolerates AWSTemplateFormatVersion absent when Transform is present at
  // top level — already covered above.
  return null;
}

function readHead(absPath: string): string | null {
  try {
    const fd = fs.openSync(absPath, 'r');
    try {
      const buf = Buffer.alloc(SNIFF_BYTES);
      const bytes = fs.readSync(fd, buf, 0, SNIFF_BYTES, 0);
      return buf.toString('utf-8', 0, bytes);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function glob(rootDir: string, patterns: string[]): string[] {
  const out: string[] = [];
  for (const pattern of patterns) {
    try {
      const matches = fg.sync(pattern, {
        cwd: rootDir,
        onlyFiles: true,
        dot: true,
        ignore: IGNORE,
      });
      out.push(...matches);
    } catch {
      // ignore glob errors
    }
  }
  return Array.from(new Set(out));
}
