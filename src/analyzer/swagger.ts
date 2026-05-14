import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import traverse from '@babel/traverse';
import type { File as ASTFile } from '@babel/types';
import type { SwaggerInfo } from '../types';

export function detectSwagger(
  rootDir: string,
  files: Map<string, ASTFile | null>,
): SwaggerInfo {
  const result: SwaggerInfo = {
    decoratorsUsed: false,
  };

  // 1. Look for swagger/openapi spec files
  const specPatterns = [
    'swagger.json', 'swagger.yaml', 'swagger.yml',
    'openapi.json', 'openapi.yaml', 'openapi.yml',
    'api-docs.json', 'api-spec.json',
    'docs/swagger.*', 'docs/openapi.*',
    'api/swagger.*', 'api/openapi.*',
  ];

  for (const pattern of specPatterns) {
    const matches = glob.sync(pattern, {
      cwd: rootDir,
      nodir: true,
      ignore: ['**/node_modules/**', '**/dist/**'],
    });
    if (matches.length > 0) {
      result.specFile = matches[0];
      parseSpecFile(path.join(rootDir, matches[0]), result);
      break;
    }
  }

  // 2. Check for swagger setup in code (NestJS SwaggerModule, express-swagger, etc.)
  for (const [filePath, ast] of files) {
    if (!ast) continue;
    scanForSwaggerSetup(filePath, ast, result);
  }

  // 3. Check for swagger decorator usage (@ApiTags, @ApiResponse, etc.)
  for (const [, ast] of files) {
    if (!ast) continue;
    if (scanForSwaggerDecorators(ast)) {
      result.decoratorsUsed = true;
      break;
    }
  }

  return result;
}

function parseSpecFile(filePath: string, result: SwaggerInfo): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    if (filePath.endsWith('.json')) {
      const spec = JSON.parse(content);
      result.title = spec.info?.title;
      result.version = spec.info?.version || spec.openapi || spec.swagger;
      result.basePath = spec.basePath || spec.servers?.[0]?.url;
      if (spec.paths) {
        result.endpointCount = Object.keys(spec.paths).length;
      }
    } else {
      // Lightweight YAML parsing for common fields
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        const titleMatch = trimmed.match(/^title:\s*["']?(.+?)["']?\s*$/);
        if (titleMatch) result.title = titleMatch[1];

        const versionMatch = trimmed.match(/^(?:version|openapi|swagger):\s*["']?(.+?)["']?\s*$/);
        if (versionMatch && !result.version) result.version = versionMatch[1];

        const baseMatch = trimmed.match(/^basePath:\s*["']?(.+?)["']?\s*$/);
        if (baseMatch) result.basePath = baseMatch[1];
      }
    }
  } catch {
    // Skip unparseable spec files
  }
}

function scanForSwaggerSetup(filePath: string, ast: ASTFile, result: SwaggerInfo): void {
  traverse(ast, {
    ImportDeclaration({ node }) {
      const src = node.source.value;
      if (src === '@nestjs/swagger' || src === 'swagger-ui-express' || src === 'swagger-jsdoc' || src === 'fastify-swagger') {
        result.setupFile = filePath;
      }
    },

    CallExpression({ node }) {
      // SwaggerModule.createDocument(app, config)
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'SwaggerModule' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'createDocument'
      ) {
        result.setupFile = filePath;
      }

      // SwaggerModule.setup('path', app, document) — extract the UI route
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'SwaggerModule' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'setup' &&
        node.arguments.length >= 1
      ) {
        result.setupFile = filePath;
        const routeArg = node.arguments[0];
        if (routeArg.type === 'StringLiteral') {
          result.uiRoute = routeArg.value;
        } else if (routeArg.type === 'TemplateLiteral' && routeArg.quasis.length > 0) {
          // Template like `${prefix}/doc` — extract the last path segment
          const lastQuasi = routeArg.quasis[routeArg.quasis.length - 1].value.raw;
          if (lastQuasi) result.uiRoute = lastQuasi;
        }
      }

      // Express: app.use('/api-docs', swaggerUi.serve)
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'use' &&
        node.arguments.length >= 2 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        const pathArg = node.arguments[0].value;
        // Check if second arg references swagger
        const secondArg = node.arguments[1];
        const isSwagger = (secondArg.type === 'MemberExpression' &&
          secondArg.object.type === 'Identifier' &&
          secondArg.object.name.toLowerCase().includes('swagger'));
        if (isSwagger) {
          result.uiRoute = pathArg;
        }
      }

      // DocumentBuilder().setTitle('...').setVersion('...')
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier'
      ) {
        const method = node.callee.property.name;
        if (method === 'setTitle' && node.arguments[0]?.type === 'StringLiteral') {
          result.title = node.arguments[0].value;
        }
        if (method === 'setVersion' && node.arguments[0]?.type === 'StringLiteral') {
          result.version = node.arguments[0].value;
        }
      }
    },
  });
}

function scanForSwaggerDecorators(ast: ASTFile): boolean {
  const swaggerDecorators = new Set([
    'ApiTags', 'ApiOperation', 'ApiResponse', 'ApiProperty',
    'ApiParam', 'ApiQuery', 'ApiBody', 'ApiHeader',
    'ApiBearerAuth', 'ApiOAuth2', 'ApiSecurity',
    'ApiExcludeEndpoint', 'ApiExcludeController',
  ]);

  let found = false;
  traverse(ast, {
    Decorator({ node }) {
      const expr = node.expression;
      let decName = '';
      if (expr.type === 'Identifier') decName = expr.name;
      else if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
        decName = expr.callee.name;
      }
      if (swaggerDecorators.has(decName)) {
        found = true;
      }
    },
  });
  return found;
}
