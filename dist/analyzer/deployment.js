"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectDeployment = detectDeployment;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
function detectDeployment(rootDir) {
    const result = {
        dockerfiles: [],
        composeServices: [],
        ciPipelines: [],
        k8sResources: [],
    };
    // Find relevant files
    const dockerfiles = findFiles(rootDir, ['Dockerfile', 'Dockerfile.*', '*.Dockerfile', '**/Dockerfile', '**/Dockerfile.*']);
    const composeFiles = findFiles(rootDir, ['docker-compose*.yml', 'docker-compose*.yaml', 'compose*.yml', 'compose*.yaml']);
    const ciFiles = findFiles(rootDir, [
        '.github/workflows/*.yml', '.github/workflows/*.yaml',
        '.gitlab-ci.yml', '.circleci/config.yml',
        'Jenkinsfile', '.travis.yml', 'bitbucket-pipelines.yml',
        'azure-pipelines.yml',
    ]);
    const k8sFiles = findFiles(rootDir, [
        'k8s/**/*.yml', 'k8s/**/*.yaml',
        'kubernetes/**/*.yml', 'kubernetes/**/*.yaml',
        'deploy/**/*.yml', 'deploy/**/*.yaml',
        'manifests/**/*.yml', 'manifests/**/*.yaml',
    ]);
    // Parse Dockerfiles
    for (const df of dockerfiles) {
        const content = safeReadFile(path.join(rootDir, df));
        if (!content)
            continue;
        result.dockerfiles.push(parseDockerfile(df, content));
    }
    // Parse docker-compose files
    for (const cf of composeFiles) {
        const content = safeReadFile(path.join(rootDir, cf));
        if (!content)
            continue;
        result.composeServices.push(...parseComposeFile(content));
    }
    // Parse CI/CD files
    for (const ci of ciFiles) {
        const content = safeReadFile(path.join(rootDir, ci));
        if (!content)
            continue;
        result.ciPipelines.push(parseCiFile(ci, content));
    }
    // Parse Kubernetes manifests
    for (const k8s of k8sFiles) {
        const content = safeReadFile(path.join(rootDir, k8s));
        if (!content)
            continue;
        const resources = parseK8sFile(k8s, content);
        result.k8sResources.push(...resources);
    }
    return result;
}
function findFiles(rootDir, patterns) {
    const results = [];
    for (const pattern of patterns) {
        try {
            const matches = fast_glob_1.default.sync(pattern, {
                cwd: rootDir,
                onlyFiles: true,
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
            });
            results.push(...matches);
        }
        catch {
            // ignore glob errors
        }
    }
    return [...new Set(results)];
}
function safeReadFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return null;
    }
}
// Lightweight Dockerfile parser (no dependencies)
function parseDockerfile(filePath, content) {
    const lines = content.split('\n');
    const baseImages = [];
    const ports = [];
    const stages = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed)
            continue;
        const fromMatch = trimmed.match(/^FROM\s+(\S+)(?:\s+[Aa][Ss]\s+(\S+))?/i);
        if (fromMatch) {
            baseImages.push(fromMatch[1]);
            if (fromMatch[2])
                stages.push(fromMatch[2]);
        }
        const exposeMatch = trimmed.match(/^EXPOSE\s+(.+)/i);
        if (exposeMatch) {
            ports.push(...exposeMatch[1].split(/\s+/).map(p => p.replace(/\/\w+$/, '')));
        }
    }
    return {
        path: filePath,
        baseImage: baseImages[baseImages.length - 1] || 'unknown',
        exposedPorts: ports,
        stages: stages.length > 0 ? stages : undefined,
    };
}
// Lightweight YAML-like docker-compose parser (no yaml dependency)
function parseComposeFile(content) {
    const services = [];
    const lines = content.split('\n');
    let inServices = false;
    let currentService = null;
    let currentIndent = 0;
    let serviceData = {};
    let currentKey = '';
    for (const line of lines) {
        const stripped = line.replace(/\r$/, '');
        if (!stripped.trim() || stripped.trim().startsWith('#'))
            continue;
        const indent = stripped.search(/\S/);
        // Top-level key
        if (indent === 0) {
            if (currentService) {
                services.push({ name: currentService, ...serviceData });
                currentService = null;
                serviceData = {};
            }
            inServices = stripped.trim() === 'services:';
            continue;
        }
        if (!inServices)
            continue;
        // Service name (indent level 2)
        if (indent === 2 && stripped.trim().endsWith(':') && !stripped.trim().startsWith('-')) {
            if (currentService) {
                services.push({ name: currentService, ...serviceData });
                serviceData = {};
            }
            currentService = stripped.trim().replace(':', '');
            currentIndent = indent;
            continue;
        }
        if (!currentService)
            continue;
        // Service properties (indent level 4+)
        const propMatch = stripped.trim().match(/^(\w+):\s*(.*)?$/);
        if (propMatch && indent >= 4 && indent <= 6) {
            currentKey = propMatch[1];
            const value = propMatch[2]?.trim();
            if (currentKey === 'image' && value) {
                serviceData.image = value;
            }
        }
        // List items under a key
        const listItem = stripped.trim().match(/^-\s+(.+)/);
        if (listItem && currentService) {
            const val = listItem[1].replace(/["']/g, '').trim();
            if (currentKey === 'ports') {
                if (!serviceData.ports)
                    serviceData.ports = [];
                serviceData.ports.push(val);
            }
            else if (currentKey === 'depends_on') {
                if (!serviceData.dependsOn)
                    serviceData.dependsOn = [];
                serviceData.dependsOn.push(val.replace(/:$/, ''));
            }
            else if (currentKey === 'volumes') {
                if (!serviceData.volumes)
                    serviceData.volumes = [];
                serviceData.volumes.push(val);
            }
        }
    }
    if (currentService) {
        services.push({ name: currentService, ...serviceData });
    }
    return services;
}
// Lightweight CI/CD pipeline parser
function parseCiFile(filePath, content) {
    let tool = 'Unknown CI';
    if (filePath.includes('.github/workflows'))
        tool = 'GitHub Actions';
    else if (filePath.includes('.gitlab-ci'))
        tool = 'GitLab CI';
    else if (filePath.includes('.circleci'))
        tool = 'CircleCI';
    else if (filePath.includes('Jenkinsfile'))
        tool = 'Jenkins';
    else if (filePath.includes('.travis'))
        tool = 'Travis CI';
    else if (filePath.includes('bitbucket'))
        tool = 'Bitbucket Pipelines';
    else if (filePath.includes('azure'))
        tool = 'Azure DevOps';
    const triggers = [];
    const jobs = [];
    const lines = content.split('\n');
    let inOn = false;
    let inJobs = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        // GitHub Actions triggers
        if (trimmed === 'on:') {
            inOn = true;
            inJobs = false;
            continue;
        }
        if (trimmed === 'jobs:') {
            inJobs = true;
            inOn = false;
            continue;
        }
        if (inOn && line.search(/\S/) === 2 && trimmed.endsWith(':')) {
            triggers.push(trimmed.replace(':', ''));
        }
        // Job names
        if (inJobs && line.search(/\S/) === 2 && trimmed.endsWith(':') && !trimmed.startsWith('-')) {
            jobs.push(trimmed.replace(':', ''));
        }
        // GitLab CI stages
        if (trimmed.startsWith('stages:'))
            continue;
        // Non-GitHub job detection (GitLab-style top-level keys with script:)
        if (tool !== 'GitHub Actions' && line.search(/\S/) === 0 && trimmed.endsWith(':') && !['stages:', 'variables:', 'image:', 'services:', 'before_script:', 'after_script:', 'cache:'].includes(trimmed)) {
            const jobName = trimmed.replace(':', '');
            if (!['default', 'include', 'workflow'].includes(jobName)) {
                jobs.push(jobName);
            }
        }
    }
    return {
        path: filePath,
        tool,
        triggers: triggers.length > 0 ? triggers : undefined,
        jobs: jobs.length > 0 ? jobs : undefined,
    };
}
// Lightweight Kubernetes manifest parser
function parseK8sFile(filePath, content) {
    const resources = [];
    // Split multi-document YAML
    const docs = content.split(/^---$/m);
    for (const doc of docs) {
        let kind = '';
        let name = '';
        let inMetadata = false;
        for (const line of doc.split('\n')) {
            const trimmed = line.trim();
            const kindMatch = trimmed.match(/^kind:\s*(.+)/);
            if (kindMatch)
                kind = kindMatch[1].trim();
            if (trimmed === 'metadata:') {
                inMetadata = true;
                continue;
            }
            if (inMetadata && trimmed.match(/^name:\s*(.+)/)) {
                name = trimmed.replace(/^name:\s*/, '').trim();
                inMetadata = false;
            }
            if (inMetadata && line.search(/\S/) <= 0)
                inMetadata = false;
        }
        if (kind && name) {
            resources.push({ path: filePath, kind, name });
        }
    }
    return resources;
}
//# sourceMappingURL=deployment.js.map