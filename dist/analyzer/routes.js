"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectRoutes = detectRoutes;
const traverse_1 = __importDefault(require("@babel/traverse"));
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);
const NESTJS_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All']);
function detectRoutes(files) {
    const routes = [];
    for (const [filePath, ast] of files) {
        if (!ast)
            continue;
        scanFileForRoutes(filePath, ast, routes);
    }
    // Sort by path then method
    return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
const GUARD_DECORATORS = new Set(['UseGuards', 'Roles', 'SetMetadata']);
const PUBLIC_DECORATORS = new Set(['Public', 'SkipAuth', 'AllowAnonymous', 'IsPublic']);
function extractGuards(decorators) {
    const guards = [];
    let isPublic = false;
    for (const dec of decorators) {
        const expr = dec.expression;
        let decName = '';
        let args = [];
        if (expr.type === 'Identifier') {
            decName = expr.name;
        }
        else if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier') {
            decName = expr.callee.name;
            args = expr.arguments || [];
        }
        if (PUBLIC_DECORATORS.has(decName)) {
            isPublic = true;
        }
        if (decName === 'UseGuards') {
            for (const arg of args) {
                if (arg.type === 'Identifier')
                    guards.push(arg.name);
                if (arg.type === 'NewExpression' && arg.callee.type === 'Identifier')
                    guards.push(arg.callee.name);
            }
        }
        if (decName === 'ApiBearerAuth' || decName === 'ApiOAuth2' || decName === 'ApiSecurity') {
            if (!guards.some(g => g.toLowerCase().includes('auth'))) {
                guards.push(decName === 'ApiBearerAuth' ? 'BearerAuth' : decName === 'ApiOAuth2' ? 'OAuth2' : 'ApiSecurity');
            }
        }
    }
    return { guards, isPublic };
}
// Identifier names commonly bound to HTTP client libraries — `axios.get('/x')`,
// `api.get('/x')`, etc. are NOT routes, they're outbound HTTP calls.
const CLIENT_OBJECT_NAMES = new Set([
    'axios', 'api', 'client', 'http', 'fetch', 'request', 'got', 'ky',
    'httpClient', 'apiClient', 'publicClient', 'instance',
]);
// Identifier names that ARE typically server objects bound to a route registrar.
const SERVER_OBJECT_NAMES = new Set([
    'app', 'server', 'router', 'r', 'rt', 'express',
]);
function fileLooksLikeServer(ast) {
    const SERVER_PKGS = /^(express|@nestjs\/core|fastify|koa|@koa\/router|hono|polka|restify)/;
    const CLIENT_PKGS = /^(axios|got|ky|node-fetch|@forge\/api|isomorphic-fetch|undici)$/;
    let hasServer = false;
    let hasClient = false;
    (0, traverse_1.default)(ast, {
        ImportDeclaration(p) {
            const src = p.node.source.value;
            if (SERVER_PKGS.test(src))
                hasServer = true;
            if (CLIENT_PKGS.test(src))
                hasClient = true;
        },
    });
    // If the file imports BOTH (rare), bias toward server (e.g. a server using axios internally).
    if (hasServer)
        return true;
    if (hasClient)
        return false;
    // Unknown — let downstream identifier checks decide.
    return false;
}
function scanFileForRoutes(filePath, ast, routes) {
    // Track controller base path and class-level guards for NestJS
    let controllerBasePath = '';
    let classGuards = [];
    let classIsPublic = false;
    const isServerFile = fileLooksLikeServer(ast);
    (0, traverse_1.default)(ast, {
        // NestJS @Controller('path') decorator
        ClassDeclaration(path) {
            const decorators = path.node.decorators;
            if (!decorators)
                return;
            // Reset class-level guards
            classGuards = [];
            classIsPublic = false;
            for (const dec of decorators) {
                const expr = dec.expression;
                if (expr.type === 'CallExpression' &&
                    expr.callee.type === 'Identifier' &&
                    expr.callee.name === 'Controller' &&
                    expr.arguments.length >= 1 &&
                    expr.arguments[0].type === 'StringLiteral') {
                    controllerBasePath = '/' + expr.arguments[0].value.replace(/^\//, '');
                }
            }
            // Extract class-level guards
            const guardInfo = extractGuards(decorators);
            classGuards = guardInfo.guards;
            classIsPublic = guardInfo.isPublic;
        },
        // Express-style: app.get('/path', handler) or router.get('/path', handler)
        CallExpression({ node }) {
            if (node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier' &&
                HTTP_METHODS.has(node.callee.property.name) &&
                node.arguments.length >= 1) {
                // Disambiguate Express `app.get('/x', handler)` from axios-style
                // `api.get('/x')` (a client call). Use object-name allow/deny lists
                // and file-level import signals.
                const objNode = node.callee.object;
                const objName = (objNode?.type === 'Identifier' && objNode.name) ||
                    (objNode?.type === 'MemberExpression' && objNode.property?.name) ||
                    '';
                const isKnownClient = CLIENT_OBJECT_NAMES.has(objName);
                const isKnownServer = SERVER_OBJECT_NAMES.has(objName);
                // Skip when:
                //  - the object identifier is a known client (axios/api/client/...), OR
                //  - the file imports a client lib but no server lib AND the object
                //    isn't a known server name (so we don't accept `api.get` in a
                //    fetch-only file just because we couldn't tell what it was).
                const skipAsClientCall = isKnownClient || (!isServerFile && !isKnownServer);
                const firstArg = node.arguments[0];
                const pathValue = extractPath(firstArg);
                if (pathValue && !skipAsClientCall) {
                    const method = node.callee.property.name.toUpperCase();
                    const handler = extractHandlerName(node.arguments);
                    routes.push({ method, path: pathValue, file: filePath, handler });
                }
            }
            // Express: app.use('/api', router)
            if (node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'use' &&
                node.arguments.length >= 1 &&
                node.arguments[0].type === 'StringLiteral' &&
                node.arguments[0].value.startsWith('/')) {
                routes.push({
                    method: 'USE',
                    path: node.arguments[0].value,
                    file: filePath,
                    handler: node.arguments.length > 1 ? extractHandlerName(node.arguments.slice(1)) : 'middleware',
                });
            }
            // Fastify: fastify.route({ method, url, handler })
            if (node.callee.type === 'MemberExpression' &&
                node.callee.property.type === 'Identifier' &&
                node.callee.property.name === 'route' &&
                node.arguments.length === 1 &&
                node.arguments[0].type === 'ObjectExpression') {
                let method = '';
                let routePath = '';
                let handler = '';
                for (const prop of node.arguments[0].properties) {
                    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier')
                        continue;
                    if (prop.key.name === 'method' && prop.value.type === 'StringLiteral')
                        method = prop.value.value.toUpperCase();
                    if (prop.key.name === 'url' && prop.value.type === 'StringLiteral')
                        routePath = prop.value.value;
                    if (prop.key.name === 'handler' && prop.value.type === 'Identifier')
                        handler = prop.value.name;
                }
                if (method && routePath) {
                    routes.push({ method, path: routePath, file: filePath, handler: handler || 'anonymous' });
                }
            }
        },
        // NestJS method decorators: @Get('/path'), @Post('/path')
        ClassMethod(path) {
            const decorators = path.node.decorators;
            if (!decorators)
                return;
            // Extract method-level guards
            const methodGuardInfo = extractGuards(decorators);
            const mergedGuards = [...new Set([...classGuards, ...methodGuardInfo.guards])];
            const isPublic = methodGuardInfo.isPublic || classIsPublic;
            for (const dec of decorators) {
                const expr = dec.expression;
                let methodName = '';
                let routePath = '';
                if (expr.type === 'Identifier' && NESTJS_DECORATORS.has(expr.name)) {
                    methodName = expr.name.toUpperCase();
                    routePath = controllerBasePath || '/';
                }
                else if (expr.type === 'CallExpression' &&
                    expr.callee.type === 'Identifier' &&
                    NESTJS_DECORATORS.has(expr.callee.name)) {
                    methodName = expr.callee.name.toUpperCase();
                    if (expr.arguments.length >= 1 && expr.arguments[0].type === 'StringLiteral') {
                        const subPath = expr.arguments[0].value.replace(/^\//, '');
                        routePath = controllerBasePath ? `${controllerBasePath}/${subPath}` : `/${subPath}`;
                    }
                    else {
                        routePath = controllerBasePath || '/';
                    }
                }
                if (methodName) {
                    const handler = path.node.key.name || 'anonymous';
                    // Normalize double slashes from empty base path + sub path
                    routePath = routePath.replace(/\/\/+/g, '/');
                    const route = { method: methodName, path: routePath, file: filePath, handler };
                    if (mergedGuards.length > 0)
                        route.guards = mergedGuards;
                    if (isPublic)
                        route.isPublic = true;
                    routes.push(route);
                }
            }
        },
    });
}
function extractPath(node) {
    if (node.type === 'StringLiteral' && node.value.startsWith('/')) {
        return node.value;
    }
    if (node.type === 'TemplateLiteral' && node.quasis.length > 0) {
        const raw = node.quasis[0].value?.raw;
        if (raw && raw.startsWith('/'))
            return raw + (node.expressions.length > 0 ? '...' : '');
    }
    return null;
}
function extractHandlerName(args) {
    for (const arg of args) {
        if (arg.type === 'Identifier')
            return arg.name;
        if (arg.type === 'FunctionExpression' && arg.id)
            return arg.id.name;
        if (arg.type === 'ArrowFunctionExpression')
            return 'anonymous';
    }
    return 'anonymous';
}
//# sourceMappingURL=routes.js.map