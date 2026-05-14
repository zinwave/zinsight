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
exports.detectSwagger = detectSwagger;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const traverse_1 = __importDefault(require("@babel/traverse"));
function detectSwagger(rootDir, files) {
    const result = {
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
        const matches = fast_glob_1.default.sync(pattern, {
            cwd: rootDir,
            onlyFiles: true,
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
        if (!ast)
            continue;
        scanForSwaggerSetup(filePath, ast, result);
    }
    // 3. Check for swagger decorator usage (@ApiTags, @ApiResponse, etc.)
    for (const [, ast] of files) {
        if (!ast)
            continue;
        if (scanForSwaggerDecorators(ast)) {
            result.decoratorsUsed = true;
            break;
        }
    }
    return result;
}
function parseSpecFile(filePath, result) {
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
        }
        else {
            // Lightweight YAML parsing for common fields
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                const titleMatch = trimmed.match(/^title:\s*["']?(.+?)["']?\s*$/);
                if (titleMatch)
                    result.title = titleMatch[1];
                const versionMatch = trimmed.match(/^(?:version|openapi|swagger):\s*["']?(.+?)["']?\s*$/);
                if (versionMatch && !result.version)
                    result.version = versionMatch[1];
                const baseMatch = trimmed.match(/^basePath:\s*["']?(.+?)["']?\s*$/);
                if (baseMatch)
                    result.basePath = baseMatch[1];
            }
        }
    }
    catch {
        // Skip unparseable spec files
    }
}
function scanForSwaggerSetup(filePath, ast, result) {
    (0, traverse_1.default)(ast, {
        ImportDeclaration({ node }) {
            const src = node.source.value;
            if (src === '@nestjs/swagger' || src === 'swagger-ui-express' || src === 'swagger-jsdoc' || src === 'fastify-swagger') {
                result.setupFile = filePath;
            }
        },
        CallExpression({ node }) {
            // SwaggerModule.createDocument(app, config)
            if (node.callee.type === 'MemberExpression' &&
                node.callee.object.type === 'Identifier' &&
                node.callee.object.name === 'SwaggerModule' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'createDocument') {
                result.setupFile = filePath;
            }
            // SwaggerModule.setup('path', app, document) — extract the UI route
            if (node.callee.type === 'MemberExpression' &&
                node.callee.object.type === 'Identifier' &&
                node.callee.object.name === 'SwaggerModule' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'setup' &&
                node.arguments.length >= 1) {
                result.setupFile = filePath;
                const routeArg = node.arguments[0];
                if (routeArg.type === 'StringLiteral') {
                    result.uiRoute = routeArg.value;
                }
                else if (routeArg.type === 'TemplateLiteral' && routeArg.quasis.length > 0) {
                    // Template like `${prefix}/doc` — extract the last path segment
                    const lastQuasi = routeArg.quasis[routeArg.quasis.length - 1].value.raw;
                    if (lastQuasi)
                        result.uiRoute = lastQuasi;
                }
            }
            // Express: app.use('/api-docs', swaggerUi.serve)
            if (node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'use' &&
                node.arguments.length >= 2 &&
                node.arguments[0].type === 'StringLiteral') {
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
            if (node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier') {
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
function scanForSwaggerDecorators(ast) {
    const swaggerDecorators = new Set([
        'ApiTags', 'ApiOperation', 'ApiResponse', 'ApiProperty',
        'ApiParam', 'ApiQuery', 'ApiBody', 'ApiHeader',
        'ApiBearerAuth', 'ApiOAuth2', 'ApiSecurity',
        'ApiExcludeEndpoint', 'ApiExcludeController',
    ]);
    let found = false;
    (0, traverse_1.default)(ast, {
        Decorator({ node }) {
            const expr = node.expression;
            let decName = '';
            if (expr.type === 'Identifier')
                decName = expr.name;
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
//# sourceMappingURL=swagger.js.map