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
]);

export function detectExternalServices(
  files: Map<string, ASTFile | null>,
  contentMap: Map<string, string>,
): ExternalService[] {
  const serviceMap = new Map<string, {
    label: string;
    type: ExternalService['type'];
    methods: Set<string>;
    files: Set<string>;
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
    if (JUNK_HOSTS.has(host)) continue;
    // Also skip "services" with no detected HTTP methods AND a label that
    // looks like a generic vanity domain (heuristic: top-level domain only,
    // no API path, no methods).
    if (data.methods.size === 0 && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url) && url === host) {
      // No methods + bare domain → likely a string in markup, not a call.
      // Only keep if explicitly recognised as an OAuth or API endpoint.
      if (data.type === 'unknown') continue;
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
) {
  const { domain, label, type } = classifyUrl(url);
  const key = label; // Group by label, not URL

  if (!serviceMap.has(key)) {
    serviceMap.set(key, {
      label,
      type,
      methods: new Set(),
      files: new Set(),
    });
  }
  const entry = serviceMap.get(key)!;
  entry.files.add(filePath);
  if (method) entry.methods.add(method.toUpperCase());
}

function scanFileForServices(
  filePath: string,
  ast: ASTFile,
  content: string,
  serviceMap: Map<string, any>,
): void {
  // Extract URLs from string literals via regex on content (catches template literals too)
  const urlRegex = /https?:\/\/[a-zA-Z0-9\-._~:/?#\[\]@!$&()*+,;=%]+/g;
  const urlMatches = content.match(urlRegex) || [];
  for (let url of urlMatches) {
    // Strip trailing punctuation that's likely not part of the URL
    url = url.replace(/[';,)\]]+$/, '');
    // Skip template literal artifacts (e.g., https://${VAR} → https://$)
    if (url.includes('$') || url.includes('{') || url.includes('}')) continue;
    // Skip URLs that are too short to be real (e.g., https://x)
    if (url.length < 12) continue;
    // Skip localhost, example.com, internal relative URLs
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('example.com')) continue;
    // Skip common non-API URLs
    if (url.includes('github.com/') && !url.includes('api.github.com')) continue;
    if (url.includes('npmjs.org') || url.includes('npmjs.com')) continue;
    if (url.includes('w3.org') || url.includes('json-schema.org')) continue;
    // Skip placeholder/example domains
    if (url.includes('yourdomain') || url.includes('mysite') || url.includes('your-') || url.includes('example')) continue;
    addService(serviceMap, url, filePath, '');
  }

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
          addService(serviceMap, url, filePath, method);
        }
      }

      // axios.get/post/etc('url')
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        HTTP_METHODS.has(node.callee.property.name) &&
        node.arguments.length >= 1
      ) {
        const url = extractStringValue(node.arguments[0]);
        if (url && url.startsWith('http')) {
          addService(serviceMap, url, filePath, node.callee.property.name);
        }
      }

      // axios({ url: '...', method: '...' })
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
          addService(serviceMap, url, filePath, method);
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
