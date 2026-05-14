import * as fs from 'fs';
import * as path from 'path';
import type { TechStack } from '../types';

interface DepMap {
  [name: string]: string;
}

const FRAMEWORK_MAP: Record<string, string> = {
  react: 'React',
  'react-dom': 'React DOM',
  next: 'Next.js',
  vue: 'Vue.js',
  nuxt: 'Nuxt.js',
  svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit',
  angular: 'Angular',
  '@angular/core': 'Angular',
  express: 'Express',
  fastify: 'Fastify',
  koa: 'Koa',
  hapi: 'Hapi',
  '@hapi/hapi': 'Hapi',
  '@nestjs/core': 'NestJS',
  '@nestjs/common': 'NestJS',
  gatsby: 'Gatsby',
  remix: 'Remix',
  '@remix-run/react': 'Remix',
  electron: 'Electron',
  'react-native': 'React Native',
  expo: 'Expo',
  '@forge/api': 'Atlassian Forge',
  '@forge/bridge': 'Atlassian Forge Bridge',
  '@forge/resolver': 'Atlassian Forge Resolver',
  astro: 'Astro',
  'solid-js': 'Solid.js',
  preact: 'Preact',
};

const DATABASE_MAP: Record<string, string> = {
  mongodb: 'MongoDB',
  mongoose: 'MongoDB (Mongoose)',
  pg: 'PostgreSQL',
  'pg-pool': 'PostgreSQL',
  mysql: 'MySQL',
  mysql2: 'MySQL',
  'better-sqlite3': 'SQLite',
  sqlite3: 'SQLite',
  redis: 'Redis',
  ioredis: 'Redis (ioredis)',
  '@prisma/client': 'Prisma',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  knex: 'Knex.js',
  drizzle: 'Drizzle ORM',
  'drizzle-orm': 'Drizzle ORM',
  '@aws-sdk/client-dynamodb': 'DynamoDB',
  firebase: 'Firebase',
  'firebase-admin': 'Firebase Admin',
};

const ORM_MAP: Record<string, string> = {
  mongoose: 'Mongoose',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  '@prisma/client': 'Prisma',
  knex: 'Knex.js',
  'drizzle-orm': 'Drizzle ORM',
  objection: 'Objection.js',
  bookshelf: 'Bookshelf.js',
  '@nestjs/mongoose': 'NestJS Mongoose',
  '@nestjs/typeorm': 'NestJS TypeORM',
};

const HTTP_CLIENT_MAP: Record<string, string> = {
  axios: 'Axios',
  'node-fetch': 'node-fetch',
  got: 'Got',
  superagent: 'SuperAgent',
  undici: 'Undici',
  'cross-fetch': 'cross-fetch',
  ky: 'Ky',
};

const AUTH_MAP: Record<string, string> = {
  passport: 'Passport.js',
  jsonwebtoken: 'JWT (jsonwebtoken)',
  'jose': 'JOSE',
  bcrypt: 'bcrypt',
  bcryptjs: 'bcryptjs',
  '@auth0/nextjs-auth0': 'Auth0',
  'next-auth': 'NextAuth.js',
  '@supabase/supabase-js': 'Supabase Auth',
  'firebase-admin': 'Firebase Auth',
  '@clerk/nextjs': 'Clerk',
  helmet: 'Helmet',
  cors: 'CORS',
  'csurf': 'CSRF Protection',
};

const TEST_MAP: Record<string, string> = {
  jest: 'Jest',
  mocha: 'Mocha',
  chai: 'Chai',
  vitest: 'Vitest',
  '@testing-library/react': 'React Testing Library',
  '@testing-library/jest-dom': 'Jest DOM',
  cypress: 'Cypress',
  playwright: 'Playwright',
  '@playwright/test': 'Playwright',
  supertest: 'SuperTest',
  sinon: 'Sinon',
  nyc: 'NYC (Coverage)',
  c8: 'c8 (Coverage)',
};

const BUILD_MAP: Record<string, string> = {
  typescript: 'TypeScript',
  webpack: 'Webpack',
  vite: 'Vite',
  esbuild: 'esbuild',
  rollup: 'Rollup',
  parcel: 'Parcel',
  '@swc/core': 'SWC',
  tsup: 'tsup',
  turbo: 'Turborepo',
  nx: 'Nx',
  eslint: 'ESLint',
  prettier: 'Prettier',
  husky: 'Husky',
  'lint-staged': 'lint-staged',
};

export function detectTechStack(rootDir: string, knownFiles: string[], actualDbTypes?: Set<string>): TechStack {
  const pkgPath = path.join(rootDir, 'package.json');
  let allDeps: DepMap = {};
  let scripts: Record<string, string> = {};
  let packageManager: string | undefined;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    scripts = pkg.scripts || {};

    // Detect package manager
    if (pkg.packageManager) {
      const pm = pkg.packageManager.split('@')[0];
      if (pm) packageManager = pm;
    }
  } catch {
    // No package.json
  }

  // Auto-detect package manager from lock files if not specified
  if (!packageManager) {
    if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
    else if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) packageManager = 'yarn';
    else if (fs.existsSync(path.join(rootDir, 'bun.lockb'))) packageManager = 'bun';
    else if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) packageManager = 'npm';
  }

  // Detect languages
  const languages: Set<string> = new Set();
  const extCounts: Record<string, number> = {};
  for (const f of knownFiles) {
    const ext = path.extname(f).toLowerCase();
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  if (extCounts['.ts'] || extCounts['.tsx']) languages.add('TypeScript');
  if (extCounts['.js'] || extCounts['.jsx'] || extCounts['.mjs'] || extCounts['.cjs']) languages.add('JavaScript');

  // Detect runtime
  let runtime = 'Node.js';
  if (allDeps['bun'] || allDeps['bun-types']) runtime = 'Bun';
  if (allDeps['deno']) runtime = 'Deno';

  const frameworks = matchDeps(allDeps, FRAMEWORK_MAP);
  let databases = matchDeps(allDeps, DATABASE_MAP);
  // Filter databases to only those actually used in code (if we have that info)
  if (actualDbTypes && actualDbTypes.size > 0) {
    const DB_TYPE_TO_LABEL: Record<string, string[]> = {
      mongodb: ['MongoDB', 'MongoDB (Mongoose)'],
      postgresql: ['PostgreSQL'],
      mysql: ['MySQL'],
      sqlite: ['SQLite'],
      redis: ['Redis', 'Redis (ioredis)'],
      dynamodb: ['DynamoDB'],
    };
    const allowedLabels = new Set<string>();
    for (const dbType of actualDbTypes) {
      for (const label of (DB_TYPE_TO_LABEL[dbType] || [])) {
        allowedLabels.add(label);
      }
    }
    // Also keep ORM/driver labels that map to confirmed DB types
    databases = databases.filter(label => allowedLabels.has(label) || label === 'Prisma' || label === 'Firebase' || label === 'Firebase Admin');
  }
  const ormLibraries = matchDeps(allDeps, ORM_MAP);
  const httpClients = matchDeps(allDeps, HTTP_CLIENT_MAP);
  const authLibraries = matchDeps(allDeps, AUTH_MAP);
  const testingTools = matchDeps(allDeps, TEST_MAP);
  const buildTools = matchDeps(allDeps, BUILD_MAP);

  // Other notable deps
  const allMapped = new Set([
    ...Object.keys(FRAMEWORK_MAP),
    ...Object.keys(DATABASE_MAP),
    ...Object.keys(ORM_MAP),
    ...Object.keys(HTTP_CLIENT_MAP),
    ...Object.keys(AUTH_MAP),
    ...Object.keys(TEST_MAP),
    ...Object.keys(BUILD_MAP),
  ]);

  const NOTABLE: Record<string, string> = {
    socket: 'Socket.IO',
    'socket.io': 'Socket.IO',
    ws: 'WebSocket (ws)',
    graphql: 'GraphQL',
    '@apollo/server': 'Apollo Server',
    'apollo-server': 'Apollo Server',
    '@apollo/client': 'Apollo Client',
    bull: 'Bull (Job Queue)',
    bullmq: 'BullMQ (Job Queue)',
    'node-cron': 'node-cron',
    nodemailer: 'Nodemailer',
    '@sendgrid/mail': 'SendGrid',
    stripe: 'Stripe',
    multer: 'Multer (File Upload)',
    sharp: 'Sharp (Image Processing)',
    pdfkit: 'PDFKit',
    puppeteer: 'Puppeteer',
    cheerio: 'Cheerio',
    lodash: 'Lodash',
    dayjs: 'Day.js',
    moment: 'Moment.js',
    'date-fns': 'date-fns',
    uuid: 'UUID',
    zod: 'Zod',
    joi: 'Joi',
    'class-validator': 'class-validator',
    'class-transformer': 'class-transformer',
    rxjs: 'RxJS',
    'winston': 'Winston (Logging)',
    'pino': 'Pino (Logging)',
    '@sentry/node': 'Sentry',
    dotenv: 'dotenv',
    swagger: 'Swagger',
    '@nestjs/swagger': 'Swagger (NestJS)',
  };

  const otherNotable = matchDeps(allDeps, NOTABLE);

  return {
    runtime,
    languages: [...languages],
    frameworks,
    databases,
    ormLibraries,
    httpClients,
    authLibraries,
    testingTools,
    buildTools,
    otherNotable,
    scripts,
    packageManager,
  };
}

function matchDeps(deps: DepMap, map: Record<string, string>): string[] {
  const matched = new Set<string>();
  for (const dep of Object.keys(deps)) {
    if (map[dep]) matched.add(map[dep]);
  }
  return [...matched].sort();
}

export function getAllDeps(rootDir: string): Record<string, string> {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return {};
  }
}
