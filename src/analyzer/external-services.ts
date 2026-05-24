import traverse from '@babel/traverse';
import type { File as ASTFile } from '@babel/types';
import type { ExternalService } from '../types';

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

// Known service patterns
const SERVICE_LABELS: Record<string, { label: string; type: ExternalService['type'] }> = {
  'api.stripe.com': { label: 'Stripe', type: 'api' },
  'api.github.com': { label: 'GitHub', type: 'api' },
  'graph.facebook.com': { label: 'Facebook', type: 'api' },
  'api.twitter.com': { label: 'Twitter/X', type: 'api' },
  'slack.com/api': { label: 'Slack', type: 'api' },
  'hooks.slack.com': { label: 'Slack Webhooks', type: 'webhook' },
  'api.sendgrid.com': { label: 'SendGrid', type: 'api' },
  'api.twilio.com': { label: 'Twilio', type: 'api' },
  'api.openai.com': { label: 'OpenAI', type: 'api' },
  'api.anthropic.com': { label: 'Anthropic', type: 'api' },
  'googleapis.com': { label: 'Google APIs', type: 'api' },
  'login.microsoftonline.com': { label: 'Microsoft OAuth', type: 'oauth' },
  'accounts.google.com': { label: 'Google OAuth', type: 'oauth' },
  'oauth.atlassian.com': { label: 'Atlassian OAuth', type: 'oauth' },
  'zoom.us': { label: 'Zoom', type: 'api' },
  'api.zoom.us': { label: 'Zoom', type: 'api' },
  'slack.com': { label: 'Slack', type: 'api' },
  'api.slack.com': { label: 'Slack', type: 'api' },
  'atlassian.com': { label: 'Atlassian', type: 'api' },
  'atlassian.net': { label: 'Atlassian', type: 'api' },
  'api.atlassian.com': { label: 'Atlassian', type: 'api' },
  'auth.atlassian.com': { label: 'Atlassian OAuth', type: 'oauth' },
  'sentry.io': { label: 'Sentry', type: 'api' },
  'cdn.jsdelivr.net': { label: 'jsDelivr CDN', type: 'cdn' },
  'unpkg.com': { label: 'unpkg CDN', type: 'cdn' },
  's3.amazonaws.com': { label: 'AWS S3', type: 'api' },
  'firebase.googleapis.com': { label: 'Firebase', type: 'api' },
};

// Hosts that show up in URL strings but are NOT real outbound integrations.
// These appear in JSON-LD schema markup (`schema.org`), share links (`bit.ly`),
// favicon CDNs, license URLs, etc. — never actual app traffic.
const JUNK_HOSTS = new Set([
  'schema.org',
  'www.w3.org',
  'w3.org',
  'bit.ly',
  'goo.gl',
  't.co',
  'creativecommons.org',
  'purl.org',
  'example.com',
  'example.org',
  'localhost',
  'tools.ietf.org',
  'datatracker.ietf.org',
  'opensource.org',
  'spdx.org',
  // Docs / scaffolding / tooling — show up in generated readme links and templates
  'vitejs.dev',
  'vite.dev',
  'cra.link',
  'create-react-app.dev',
  'reactjs.org',
  'react.dev',
  'nextjs.org',
  'tailwindcss.com',
  'eslint.org',
  'prettier.io',
  'typescriptlang.org',
  'nodejs.org',
  'developer.mozilla.org',
  'mdn.io',
  'npmjs.com',
  'npmjs.org',
  'yarnpkg.com',
  'pnpm.io',
  'github.io',
  'gitlab.com',
  'gitlab.io',
  'bitbucket.org',
  // Docs subdomains routinely embedded in code comments / scaffolding
  'docs.mongodb.com',
  'www.mongodb.com',
  'docs.aws.amazon.com',
  'docs.nestjs.com',
  'docs.docker.com',
]);

// Domain suffixes that are content hosts — never API integrations.
// (Used for *.suffix matching — not exact-host matching.)
const JUNK_SUFFIXES: RegExp[] = [
  // Image / asset CDNs
  /(^|\.)pinimg\.com$/i,
  /(^|\.)unsplash\.com$/i,
  /(^|\.)freepik\.com$/i,
  /(^|\.)vecteezy\.com$/i,
  /(^|\.)meesho\.com$/i,
  /(^|\.)pngtree\.com$/i,
  /(^|\.)iconscout\.com$/i,
  /(^|\.)togetherv\.com$/i,
  /(^|\.)cherishx\.com$/i,
  /(^|\.)creativehatti\.com$/i,
  /(^|\.)media-amazon\.com$/i,
  /(^|\.)imgur\.com$/i,
  /(^|\.)cloudinary\.com$/i,
  /(^|\.)gravatar\.com$/i,
  /\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i, // generic S3 buckets in <img src>
  // Social / share / contact
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)wa\.me$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)medium\.com$/i,
  // Marketing / brand homepages of dev tools
  /(^|\.)docker\.com$/i,
  /(^|\.)atlassian-dev\.net$/i, // cdn / asset host, not an API surface we call
];

function isJunkHost(host: string): boolean {
  if (JUNK_HOSTS.has(host)) return true;
  for (const re of JUNK_SUFFIXES) {
    if (re.test(host)) return true;
  }
  return false;
}

export function detectExternalServices(
  files: Map<string, ASTFile | null>,
  contentMap: Map<string, string>,
): ExternalService[] {
  const serviceMap = new Map<string, {
    label: string;
    type: ExternalService['type'];
    methods: Set<string>;
    files: Set<string>;
    confirmedCall: boolean;
  }>();

  for (const [filePath, ast] of files) {
    if (!ast) continue;
    const content = contentMap.get(filePath) || '';
    scanFileForServices(filePath, ast, content, serviceMap);
  }

  const results: ExternalService[] = [];
  for (const [url, data] of serviceMap) {
    // Skip well-known URL-only hosts that aren't real integrations
    const host = url.replace(/^https?:\/\//, '').split('/')[0];
    if (isJunkHost(host)) continue;
    // Drop low-confidence entries: no HTTP method captured AND no path on the URL.
    // These almost always come from a string literal embedded in source (image
    // src, doc link, share URL) rather than an actual outbound HTTP call.
    if (data.methods.size === 0 && !data.confirmedCall) {
      // Keep only when we explicitly recognised it as a known service.
      if (data.type === 'unknown' || data.label === host) continue;
    }
    results.push({
      url,
      label: data.label,
      type: data.type,
      methods: [...data.methods].sort(),
      files: [...data.files].sort(),
    });
  }
  return results.sort((a, b) => a.label.localeCompare(b.label));
}

function classifyUrl(url: string): { domain: string; label: string; type: ExternalService['type'] } {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname;

    // Check known patterns
    for (const [pattern, info] of Object.entries(SERVICE_LABELS)) {
      if (domain.includes(pattern) || url.includes(pattern)) {
        return { domain, ...info };
      }
    }

    return { domain, label: domain, type: 'api' };
  } catch {
    return { domain: url, label: url, type: 'unknown' };
  }
}

function addService(
  serviceMap: Map<string, any>,
  url: string,
  filePath: string,
  method: string,
  confirmedCall: boolean = false,
) {
  const { label, type } = classifyUrl(url);
  const key = label; // Group by label, not URL

  if (!serviceMap.has(key)) {
    serviceMap.set(key, {
      label,
      type,
      methods: new Set(),
      files: new Set(),
      confirmedCall: false,
    });
  }
  const entry = serviceMap.get(key)!;
  entry.files.add(filePath);
  if (method) entry.methods.add(method.toUpperCase());
  if (confirmedCall) entry.confirmedCall = true;
}

function scanFileForServices(
  filePath: string,
  ast: ASTFile,
  _content: string,
  serviceMap: Map<string, any>,
): void {
  // Only capture URLs that appear in real HTTP-client call sites. Earlier
  // versions also scraped every `https?://` literal in the file, which
  // produced massive false-positive lists (image CDNs, share links, doc
  // URLs, scaffolding readmes). AST-only is the source of truth.

  traverse(ast, {
    CallExpression({ node }) {
      // fetch('https://...')
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'fetch' &&
        node.arguments.length >= 1
      ) {
        const url = extractStringValue(node.arguments[0]);
        if (url && url.startsWith('http')) {
          const method = extractFetchMethod(node.arguments[1]) || 'GET';
          addService(serviceMap, url, filePath, method, true);
        }
      }

      // axios.get/post/etc('url'), client.get('url'), httpService.get('url')
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        HTTP_METHODS.has(node.callee.property.name) &&
        node.arguments.length >= 1
      ) {
        const url = extractStringValue(node.arguments[0]);
        if (url && url.startsWith('http')) {
          addService(serviceMap, url, filePath, node.callee.property.name, true);
        }
      }

      // axios({ url: '...', method: '...' }) | request({ url: '...' })
      if (
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'axios' || node.callee.name === 'request') &&
        node.arguments.length >= 1 &&
        node.arguments[0].type === 'ObjectExpression'
      ) {
        const props = node.arguments[0].properties;
        let url = '';
        let method = 'GET';
        for (const prop of props) {
          if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
          if (prop.key.name === 'url') url = extractStringValue(prop.value) || '';
          if (prop.key.name === 'method') method = extractStringValue(prop.value) || 'GET';
        }
        if (url.startsWith('http')) {
          addService(serviceMap, url, filePath, method, true);
        }
      }

      // axios.create({ baseURL: 'https://...' }) — establishes an integration target
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'create' &&
        node.arguments.length >= 1 &&
        node.arguments[0].type === 'ObjectExpression'
      ) {
        for (const prop of node.arguments[0].properties) {
          if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;
          if (prop.key.name !== 'baseURL') continue;
          const url = extractStringValue(prop.value);
          if (url && url.startsWith('http')) {
            addService(serviceMap, url, filePath, '', true);
          }
        }
      }
    },
  });
}

function extractStringValue(node: any): string | null {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length > 0) {
    return node.quasis[0].value?.raw || null;
  }
  return null;
}

function extractFetchMethod(optionsNode: any): string | null {
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') return null;
  for (const prop of optionsNode.properties) {
    if (
      prop.type === 'ObjectProperty' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'method' &&
      prop.value.type === 'StringLiteral'
    ) {
      return prop.value.value;
    }
  }
  return null;
}
