import traverse from '@babel/traverse';
import type { File as ASTFile } from '@babel/types';
import type { DatabaseConnection, DatabaseRelationship, DatabaseField, ModelSchema } from '../types';

const DB_IMPORT_PATTERNS: Record<string, DatabaseConnection['type']> = {
  mongoose: 'mongodb',
  mongodb: 'mongodb',
  MongoClient: 'mongodb',
  '@nestjs/mongoose': 'mongodb',
  pg: 'postgresql',
  'pg-pool': 'postgresql',
  knex: 'postgresql',
  sequelize: 'postgresql',
  typeorm: 'postgresql',
  '@prisma/client': 'postgresql',
  mysql: 'mysql',
  mysql2: 'mysql',
  'better-sqlite3': 'sqlite',
  sqlite3: 'sqlite',
  redis: 'redis',
  ioredis: 'redis',
  '@aws-sdk/client-dynamodb': 'dynamodb',
  '@aws-sdk/lib-dynamodb': 'dynamodb',
  'aws-sdk': 'dynamodb',
};

// Only detect these from package.json if they're also imported in code
const PACKAGE_ONLY_PATTERNS: Record<string, DatabaseConnection['type']> = {
  '@aws-sdk/client-dynamodb': 'dynamodb',
  '@aws-sdk/lib-dynamodb': 'dynamodb',
  'aws-sdk': 'dynamodb',
};

const MONGO_OPS = new Set([
  'find', 'findOne', 'findById', 'insertOne', 'insertMany',
  'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
  'aggregate', 'countDocuments', 'distinct', 'bulkWrite',
  'create', 'save', 'remove', 'lean', 'populate',
  'findOneAndUpdate', 'findOneAndDelete', 'findByIdAndUpdate',
]);

const SQL_OPS = new Set([
  'query', 'execute', 'raw', 'select', 'insert', 'update',
  'delete', 'where', 'join', 'from', 'transaction',
  'createQueryBuilder', 'getRepository',
]);

const REDIS_OPS = new Set([
  'get', 'set', 'del', 'hget', 'hset', 'lpush', 'rpush',
  'lrange', 'sadd', 'smembers', 'subscribe', 'publish',
  'expire', 'ttl', 'keys', 'scan',
]);

// AWS SDK v3 DynamoDB command classes → operation names
const DYNAMODB_COMMANDS: Record<string, string> = {
  PutCommand: 'put',
  GetCommand: 'get',
  QueryCommand: 'query',
  ScanCommand: 'scan',
  UpdateCommand: 'update',
  DeleteCommand: 'delete',
  BatchGetCommand: 'batchGet',
  BatchWriteCommand: 'batchWrite',
  TransactGetCommand: 'transactGet',
  TransactWriteCommand: 'transactWrite',
  PutItemCommand: 'putItem',
  GetItemCommand: 'getItem',
  QueryInput: 'query',
  ScanInput: 'scan',
  UpdateItemCommand: 'updateItem',
  DeleteItemCommand: 'deleteItem',
  BatchGetItemCommand: 'batchGetItem',
  BatchWriteItemCommand: 'batchWriteItem',
};

// Fields that typically reference other collections
const REF_FIELD_SUFFIXES = ['Id', 'Ids', '_id', '_ids'];

// SQL table name extraction patterns (case-insensitive)
const SQL_TABLE_PATTERNS = [
  /\bFROM\s+["`']?(\w+)["`']?/gi,
  /\bINTO\s+["`']?(\w+)["`']?/gi,
  /\bUPDATE\s+["`']?(\w+)["`']?/gi,
  /\bJOIN\s+["`']?(\w+)["`']?/gi,
  /\bDELETE\s+FROM\s+["`']?(\w+)["`']?/gi,
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?(\w+)["`']?/gi,
  /\bALTER\s+TABLE\s+["`']?(\w+)["`']?/gi,
  /\bDROP\s+TABLE\s+["`']?(\w+)["`']?/gi,
  /\bTRUNCATE\s+(?:TABLE\s+)?["`']?(\w+)["`']?/gi,
  /\bINSERT\s+INTO\s+["`']?(\w+)["`']?/gi,
];

// SQL keywords to filter out from table names
const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null',
  'true', 'false', 'set', 'values', 'as', 'on', 'using', 'order',
  'group', 'by', 'having', 'limit', 'offset', 'union', 'all',
  'exists', 'between', 'like', 'case', 'when', 'then', 'else', 'end',
  'inner', 'outer', 'left', 'right', 'cross', 'natural', 'full',
  'dual', 'information_schema', 'pg_catalog',
]);

// Collected per-model field data for relationship inference
const modelFieldsMap = new Map<string, Set<string>>(); // className → Set of field names ending in Id

// Collected full schema data per model (all fields with types)
const modelSchemasMap = new Map<string, ModelSchema>();

// Collected table relationships from JOINs
const joinRelationships: DatabaseRelationship[] = [];

export function detectDatabases(
  files: Map<string, ASTFile | null>,
  packageDeps: Record<string, string>,
): DatabaseConnection[] {
  modelFieldsMap.clear();
  modelSchemasMap.clear();
  joinRelationships.length = 0;

  const dbMap = new Map<DatabaseConnection['type'], {
    files: Set<string>;
    models: Set<string>;
    operations: Set<string>;
    importedInCode: boolean;
    relationships: DatabaseRelationship[];
  }>();

  // Scan AST first to find actual imports
  for (const [filePath, ast] of files) {
    if (!ast) continue;
    scanFileForDb(filePath, ast, dbMap);
  }

  // Only add package.json deps that are also imported in code
  for (const dep of Object.keys(packageDeps)) {
    const dbType = DB_IMPORT_PATTERNS[dep];
    if (dbType && !dbMap.has(dbType)) {
      // Dep exists but wasn't imported — skip (unused dependency)
    }
    const pkgType = PACKAGE_ONLY_PATTERNS[dep];
    if (pkgType && !dbMap.has(pkgType)) {
      // Not imported in code — skip
    }
  }

  // Post-process: deduplicate models and infer relationships
  const results: DatabaseConnection[] = [];
  for (const [type, data] of dbMap) {
    // Only include DBs that have evidence of actual usage
    if (data.files.size === 0 && !data.importedInCode) continue;

    // Deduplicate models: normalize to PascalCase and remove duplicates
    const normalizedModels = deduplicateModels([...data.models]);

    // Infer relationships from model names, actual schema fields, and JOIN patterns
    const relationships = inferRelationships(normalizedModels, modelFieldsMap);

    // Add JOIN-based relationships that reference known tables
    const modelSet = new Set(normalizedModels.map(m => m.toLowerCase()));
    for (const jr of joinRelationships) {
      if (modelSet.has(jr.from.toLowerCase()) && modelSet.has(jr.to.toLowerCase())) {
        const exists = relationships.some(r =>
          r.from.toLowerCase() === jr.from.toLowerCase() && r.to.toLowerCase() === jr.to.toLowerCase()
        );
        if (!exists) relationships.push(jr);
      }
    }

    // Collect model schemas for this DB's models (from decorators, CREATE TABLE, or DynamoDB)
    const schemas: ModelSchema[] = [];
    for (const model of normalizedModels) {
      const schema = modelSchemasMap.get(model);
      if (schema) schemas.push(schema);
    }

    // Also check for schemas by case-insensitive match
    for (const [schemaName, schema] of modelSchemasMap) {
      if (schemas.some(s => s.name === schemaName)) continue;
      if (normalizedModels.some(m => m.toLowerCase() === schemaName.toLowerCase())) {
        schemas.push(schema);
      }
    }

    results.push({
      type,
      files: [...data.files].sort(),
      models: normalizedModels.sort(),
      operations: [...data.operations].sort(),
      relationships,
      modelSchemas: schemas,
    });
  }
  return results;
}

function deduplicateModels(models: string[]): string[] {
  // Normalize: lowercase, strip underscores/hyphens, and singularize
  const normalize = (s: string): string => {
    let n = s.toLowerCase().replace(/[_\-]/g, '');
    // Simple English pluralization: remove trailing 's' (but not 'ss')
    if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) {
      n = n.slice(0, -1);
    }
    return n;
  };

  const seen = new Map<string, string>(); // normalized → best form

  for (const model of models) {
    const key = normalize(model);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, model);
    } else {
      // Prefer PascalCase over lowercase/snake_case/collection names
      if (model[0] === model[0].toUpperCase() && existing[0] === existing[0].toLowerCase()) {
        seen.set(key, model);
      }
    }
  }

  return [...seen.values()];
}

function inferRelationships(models: string[], fieldData: Map<string, Set<string>>): DatabaseRelationship[] {
  const relationships: DatabaseRelationship[] = [];

  // Build a lookup: lowercase model name → actual model name
  const modelLookup = new Map<string, string>();
  for (const model of models) {
    modelLookup.set(model.toLowerCase(), model);
  }

  // Strategy 1: Use actual field data from schema classes
  // If a schema class has a field like "managerId", and "Manager" is a known model, create a relationship
  for (const [className, fields] of fieldData) {
    // Find the model name this class maps to
    const sourceModel = modelLookup.get(className.toLowerCase());
    if (!sourceModel) continue;

    for (const field of fields) {
      // Extract the referenced model name from the field
      // e.g., "managerId" → "manager", "orgId" → "org", "teamId" → "team"
      let refName = field;
      if (refName.endsWith('Id') || refName.endsWith('_id')) {
        refName = refName.replace(/(_id|Id)$/, '');
      } else if (refName.endsWith('Ids') || refName.endsWith('_ids')) {
        refName = refName.replace(/(_ids|Ids)$/, '');
      }

      // Check if a model with this name exists (exact or prefix match)
      const refLower = refName.toLowerCase();
      let targetModel = modelLookup.get(refLower);

      // If no exact match, try prefix matching (e.g., "org" → "Organization")
      if (!targetModel) {
        for (const [modelLower, modelName] of modelLookup) {
          if (modelLower.startsWith(refLower) && refLower.length >= 3) {
            targetModel = modelName;
            break;
          }
        }
      }

      if (targetModel && targetModel !== sourceModel) {
        const isMany = field.endsWith('Ids') || field.endsWith('_ids');
        relationships.push({
          from: sourceModel,
          to: targetModel,
          field,
          type: isMany ? 'many-to-many' : 'one-to-many',
        });
      }
    }
  }

  // Strategy 2: Group related models by shared prefix (e.g., Auth*, Feedback*, Discussion*)
  const prefixGroups = new Map<string, string[]>();
  for (const model of models) {
    // Extract prefix: split PascalCase into words, take the first word if >1 word
    const words = model.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    if (words.length > 1 && words[0].length >= 3) {
      const prefix = words[0];
      if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
      prefixGroups.get(prefix)!.push(model);
    }
  }

  // For groups with 2+ models sharing a prefix, they're likely related
  // But don't create relationships here — the prefix grouping is just for ER diagram clustering
  // Actual relationships come from field data above

  // Deduplicate relationships
  const seen = new Set<string>();
  return relationships.filter(r => {
    const key = `${r.from}→${r.to}:${r.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureDb(
  dbMap: Map<DatabaseConnection['type'], { files: Set<string>; models: Set<string>; operations: Set<string>; importedInCode: boolean; relationships: DatabaseRelationship[] }>,
  type: DatabaseConnection['type'],
) {
  if (!dbMap.has(type)) {
    dbMap.set(type, { files: new Set(), models: new Set(), operations: new Set(), importedInCode: false, relationships: [] });
  }
  return dbMap.get(type)!;
}

function scanFileForDb(
  filePath: string,
  ast: ASTFile,
  dbMap: Map<DatabaseConnection['type'], { files: Set<string>; models: Set<string>; operations: Set<string>; importedInCode: boolean; relationships: DatabaseRelationship[] }>,
): void {
  traverse(ast, {
    ImportDeclaration({ node }) {
      const src = node.source.value;
      const dbType = DB_IMPORT_PATTERNS[src];
      if (dbType) {
        const db = ensureDb(dbMap, dbType);
        db.files.add(filePath);
        db.importedInCode = true;
      }

      // Detect schema/model imports — only add to DBs that were actually imported
      if (src.includes('schema') || src.includes('model') || src.includes('entity')) {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' || spec.type === 'ImportDefaultSpecifier') {
            const name = spec.local.name;
            if (name.endsWith('Schema') || name.endsWith('Model') || name.endsWith('Entity')) {
              const modelName = name.replace(/(Schema|Model|Entity)$/, '');
              // Only add to DBs that exist and are imported
              for (const [, data] of dbMap) {
                if (data.importedInCode) {
                  data.models.add(modelName);
                }
              }
            }
          }
        }
      }
    },

    CallExpression({ node }) {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length === 1 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        const dbType = DB_IMPORT_PATTERNS[node.arguments[0].value];
        if (dbType) {
          const db = ensureDb(dbMap, dbType);
          db.files.add(filePath);
          db.importedInCode = true;
        }
      }

      if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
        const method = node.callee.property.name;

        // .collection('name') → MongoDB
        if (method === 'collection' && node.arguments.length >= 1 && node.arguments[0].type === 'StringLiteral') {
          const db = ensureDb(dbMap, 'mongodb');
          db.files.add(filePath);
          db.models.add(node.arguments[0].value);
        }

        // .model('Name', schema) → Mongoose
        if (method === 'model' && node.arguments.length >= 1 && node.arguments[0].type === 'StringLiteral') {
          const db = ensureDb(dbMap, 'mongodb');
          db.files.add(filePath);
          db.models.add(node.arguments[0].value);
        }

        // sequelize.define('ModelName', { ... }) → SQL
        if (method === 'define' && node.arguments.length >= 1 && node.arguments[0].type === 'StringLiteral') {
          for (const sqlType of ['postgresql', 'mysql'] as const) {
            if (dbMap.has(sqlType)) {
              dbMap.get(sqlType)!.files.add(filePath);
              dbMap.get(sqlType)!.models.add(node.arguments[0].value);
            }
          }
        }

        // getRepository(Entity) → TypeORM
        if (method === 'getRepository' && node.arguments.length >= 1 && node.arguments[0].type === 'Identifier') {
          for (const sqlType of ['postgresql', 'mysql'] as const) {
            if (dbMap.has(sqlType)) {
              dbMap.get(sqlType)!.files.add(filePath);
              dbMap.get(sqlType)!.models.add(node.arguments[0].name);
            }
          }
        }

        // Detect operations — only for DBs already imported
        if (MONGO_OPS.has(method) && dbMap.has('mongodb')) {
          dbMap.get('mongodb')!.files.add(filePath);
          dbMap.get('mongodb')!.operations.add(method);
        }
        if (SQL_OPS.has(method) && dbMap.has('postgresql')) {
          dbMap.get('postgresql')!.files.add(filePath);
          dbMap.get('postgresql')!.operations.add(method);
        }
        if (SQL_OPS.has(method) && dbMap.has('mysql')) {
          dbMap.get('mysql')!.files.add(filePath);
          dbMap.get('mysql')!.operations.add(method);
        }
        if (REDIS_OPS.has(method) && dbMap.has('redis')) {
          dbMap.get('redis')!.files.add(filePath);
          dbMap.get('redis')!.operations.add(method);
        }

        // DynamoDB: documentClient.send(new PutCommand(...)) — detect .send() calls with DynamoDB commands
        if (method === 'send' && node.arguments.length >= 1 && node.arguments[0].type === 'NewExpression') {
          const cmdNode = node.arguments[0];
          if (cmdNode.callee.type === 'Identifier' && DYNAMODB_COMMANDS[cmdNode.callee.name]) {
            const db = ensureDb(dbMap, 'dynamodb');
            db.files.add(filePath);
            db.operations.add(DYNAMODB_COMMANDS[cmdNode.callee.name]);
            db.importedInCode = true;
          }
        }
      }

      // knex('tableName') or knex.schema.createTable('tableName') — direct function call with string arg
      if (node.callee.type === 'Identifier' && node.arguments.length >= 1 && node.arguments[0].type === 'StringLiteral') {
        const calleeName = node.callee.name;
        // knex('tableName') pattern
        if (calleeName === 'knex' || calleeName === 'db' || calleeName === 'pool') {
          const tableName = node.arguments[0].value;
          if (!SQL_KEYWORDS.has(tableName.toLowerCase()) && tableName.length > 1) {
            for (const sqlType of ['postgresql', 'mysql'] as const) {
              if (dbMap.has(sqlType)) {
                dbMap.get(sqlType)!.files.add(filePath);
                dbMap.get(sqlType)!.models.add(toPascalCase(tableName));
              }
            }
          }
        }
      }
    },

    // Detect @Schema() decorator (NestJS/Mongoose) or @Entity() (TypeORM) — extract ALL fields
    ClassDeclaration(path) {
      if (!path.node.id) return;
      const decorators = (path.node as any).decorators;
      if (!decorators) return;

      for (const dec of decorators) {
        const expr = dec.expression;
        const decName = expr.type === 'CallExpression' && expr.callee?.type === 'Identifier'
          ? expr.callee.name
          : expr.type === 'Identifier' ? expr.name : null;

        if (decName === 'Schema' || decName === 'Entity' || decName === 'Model') {
          const className = path.node.id.name;
          for (const [, data] of dbMap) {
            if (data.importedInCode) {
              data.models.add(className);
              data.files.add(filePath);
            }
          }

          // Collect ALL fields with types for schema diagrams
          const refFields = new Set<string>();
          const allFields: DatabaseField[] = [];
          const body = path.node.body;
          if (body && body.body) {
            for (const member of body.body) {
              if (member.type === 'ClassProperty' && member.key.type === 'Identifier') {
                const fieldName = member.key.name;
                const field = extractFieldInfo(fieldName, member);
                allFields.push(field);

                if (fieldName.endsWith('Id') || fieldName.endsWith('Ids') ||
                    fieldName.endsWith('_id') || fieldName.endsWith('_ids')) {
                  refFields.add(fieldName);
                }
              }
            }
          }

          if (refFields.size > 0) {
            modelFieldsMap.set(className, refFields);
          }

          if (allFields.length > 0) {
            modelSchemasMap.set(className, {
              name: className,
              fields: allFields,
              file: filePath,
            });
          }
        }
      }
    },

    // Detect AWS SDK v3 DynamoDB commands: new PutCommand(...), new GetCommand(...)
    NewExpression({ node }) {
      if (node.callee.type === 'Identifier' && DYNAMODB_COMMANDS[node.callee.name]) {
        const db = ensureDb(dbMap, 'dynamodb');
        db.files.add(filePath);
        db.operations.add(DYNAMODB_COMMANDS[node.callee.name]);
        db.importedInCode = true;

        // Try to extract table name and key fields from the command argument
        if (node.arguments.length >= 1 && node.arguments[0].type === 'ObjectExpression') {
          extractDynamoDbTableInfo(node.arguments[0], db, filePath);
        }
      }
    },

    // Detect DynamoDB patterns in object properties
    ObjectProperty({ node, parent }) {
      // TableName: 'xxx' (string literal)
      if (
        node.key.type === 'Identifier' && node.key.name === 'TableName' &&
        node.value.type === 'StringLiteral'
      ) {
        const db = ensureDb(dbMap, 'dynamodb');
        db.files.add(filePath);
        db.models.add(toPascalCase(node.value.value));
        db.importedInCode = true;
      }

      // TableName: VARIABLE_NAME (variable reference — use variable name as model hint)
      if (
        node.key.type === 'Identifier' && node.key.name === 'TableName' &&
        node.value.type === 'Identifier'
      ) {
        const db = ensureDb(dbMap, 'dynamodb');
        db.files.add(filePath);
        // Convert variable name to a model name: SAP_MAPPING_TABLE → SapMapping, USERS_TABLE → Users
        const varName = node.value.name;
        const modelName = varName
          .replace(/_TABLE$/i, '')
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, c => c.toUpperCase())
          .replace(/\s/g, '');
        if (modelName) db.models.add(modelName);
        db.importedInCode = true;

        // Try to extract key fields from sibling properties (Key, IndexName, etc.)
        if (parent.type === 'ObjectExpression') {
          extractDynamoDbFieldsFromObject(parent, modelName, filePath);
        }
      }

      // DynamoDB KeySchema / AttributeDefinitions — extract key fields
      if (
        node.key.type === 'Identifier' && node.key.name === 'AttributeDefinitions' &&
        node.value.type === 'ArrayExpression'
      ) {
        // Try to find the TableName from the parent object
        let tableName: string | null = null;
        if (parent.type === 'ObjectExpression') {
          for (const prop of parent.properties) {
            if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier' &&
                prop.key.name === 'TableName' && prop.value.type === 'StringLiteral') {
              tableName = prop.value.value;
              break;
            }
          }
        }
        if (!tableName) return;

        const modelName = toPascalCase(tableName);
        const fields: DatabaseField[] = [];

        // Parse: [{ AttributeName: 'id', AttributeType: 'S' }]
        const typeMap: Record<string, string> = { S: 'string', N: 'number', B: 'Buffer', BOOL: 'boolean' };
        for (const elem of node.value.elements) {
          if (!elem || elem.type !== 'ObjectExpression') continue;
          let attrName: string | null = null;
          let attrType = 'string';
          for (const p of elem.properties) {
            if (p.type !== 'ObjectProperty' || p.key.type !== 'Identifier') continue;
            if (p.key.name === 'AttributeName' && p.value.type === 'StringLiteral') attrName = p.value.value;
            if (p.key.name === 'AttributeType' && p.value.type === 'StringLiteral') attrType = typeMap[p.value.value] || p.value.value;
          }
          if (attrName) fields.push({ name: attrName, type: attrType, required: true, isIndex: true });
        }

        if (fields.length > 0 && !modelSchemasMap.has(modelName)) {
          modelSchemasMap.set(modelName, { name: modelName, fields, file: filePath });
        }
      }
    },

    // Extract table names from SQL string literals (raw queries)
    StringLiteral({ node }) {
      const val = node.value;
      // Only scan strings that look like SQL (contain SQL keywords)
      if (val.length < 10 || val.length > 5000) return;
      const upper = val.toUpperCase();
      if (!upper.includes('SELECT') && !upper.includes('INSERT') && !upper.includes('UPDATE') &&
          !upper.includes('DELETE') && !upper.includes('CREATE TABLE') && !upper.includes('JOIN') &&
          !upper.includes('ALTER TABLE')) return;

      // Determine which SQL DB type this belongs to
      const sqlType: DatabaseConnection['type'] | null =
        dbMap.has('postgresql') ? 'postgresql' :
        dbMap.has('mysql') ? 'mysql' :
        dbMap.has('sqlite') ? 'sqlite' : null;
      if (!sqlType) return;

      const db = ensureDb(dbMap, sqlType);
      const extractedTables: string[] = [];

      for (const pattern of SQL_TABLE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(val)) !== null) {
          const tableName = match[1];
          if (tableName && !SQL_KEYWORDS.has(tableName.toLowerCase()) && tableName.length > 1 && /^[a-zA-Z_]/.test(tableName)) {
            db.files.add(filePath);
            const model = toPascalCase(tableName);
            db.models.add(model);
            extractedTables.push(model);
          }
        }
      }

      // Infer relationships from JOINs: "FROM users JOIN orders ON users.id = orders.user_id"
      const joinPattern = /\bFROM\s+["`']?(\w+)["`']?\s+.*?\bJOIN\s+["`']?(\w+)["`']?/gi;
      joinPattern.lastIndex = 0;
      let joinMatch;
      while ((joinMatch = joinPattern.exec(val)) !== null) {
        const from = toPascalCase(joinMatch[1]);
        const to = toPascalCase(joinMatch[2]);
        if (from !== to && !SQL_KEYWORDS.has(joinMatch[1].toLowerCase()) && !SQL_KEYWORDS.has(joinMatch[2].toLowerCase())) {
          joinRelationships.push({ from, to, field: 'JOIN', type: 'one-to-many' });
        }
      }

      // Extract columns from CREATE TABLE statements
      extractCreateTableSchema(val, filePath);
    },

    // Also scan template literals for SQL
    TemplateLiteral({ node }) {
      // Build the template string from quasis
      const parts = node.quasis.map(q => q.value.raw);
      const val = parts.join('?');
      if (val.length < 10 || val.length > 5000) return;
      const upper = val.toUpperCase();
      if (!upper.includes('SELECT') && !upper.includes('INSERT') && !upper.includes('UPDATE') &&
          !upper.includes('DELETE') && !upper.includes('CREATE TABLE') && !upper.includes('JOIN')) return;

      const sqlType: DatabaseConnection['type'] | null =
        dbMap.has('postgresql') ? 'postgresql' :
        dbMap.has('mysql') ? 'mysql' :
        dbMap.has('sqlite') ? 'sqlite' : null;
      if (!sqlType) return;

      const db = ensureDb(dbMap, sqlType);

      for (const pattern of SQL_TABLE_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(val)) !== null) {
          const tableName = match[1];
          if (tableName && !SQL_KEYWORDS.has(tableName.toLowerCase()) && tableName.length > 1 && /^[a-zA-Z_]/.test(tableName)) {
            db.files.add(filePath);
            db.models.add(toPascalCase(tableName));
          }
        }
      }

      // JOINs from template literals
      const joinPattern = /\bFROM\s+["`']?(\w+)["`']?\s+.*?\bJOIN\s+["`']?(\w+)["`']?/gi;
      joinPattern.lastIndex = 0;
      let joinMatch;
      while ((joinMatch = joinPattern.exec(val)) !== null) {
        const from = toPascalCase(joinMatch[1]);
        const to = toPascalCase(joinMatch[2]);
        if (from !== to && !SQL_KEYWORDS.has(joinMatch[1].toLowerCase()) && !SQL_KEYWORDS.has(joinMatch[2].toLowerCase())) {
          joinRelationships.push({ from, to, field: 'JOIN', type: 'one-to-many' });
        }
      }

      // Extract columns from CREATE TABLE statements
      extractCreateTableSchema(val, filePath);
    },

    // Detect MongooseModule.forRoot/forFeature (NestJS)
    MemberExpression({ node }) {
      if (
        node.property.type === 'Identifier' &&
        node.object.type === 'Identifier'
      ) {
        if (node.object.name === 'MongooseModule' && (node.property.name === 'forRoot' || node.property.name === 'forRootAsync' || node.property.name === 'forFeature')) {
          const db = ensureDb(dbMap, 'mongodb');
          db.importedInCode = true;
        } else if (node.object.name === 'TypeOrmModule' && (node.property.name === 'forRoot' || node.property.name === 'forRootAsync')) {
          const db = ensureDb(dbMap, 'postgresql');
          db.importedInCode = true;
        }
      }
    },
  });
}

/**
 * Extract field info from a ClassProperty node.
 * Handles:
 * - TypeScript type annotations: `name: string`, `ids: string[]`
 * - @Prop() decorator args: `@Prop({ type: String, required: true, default: null })`
 * - @Column() decorator args for TypeORM
 */
function extractFieldInfo(fieldName: string, member: any): DatabaseField {
  const field: DatabaseField = { name: fieldName, type: 'unknown' };

  // 1. Try to get type from TypeScript type annotation
  const typeAnnotation = member.typeAnnotation?.typeAnnotation;
  if (typeAnnotation) {
    field.type = resolveTypeAnnotation(typeAnnotation);
  }

  // 2. Try to get info from @Prop() or @Column() decorator
  const decorators = member.decorators;
  if (decorators) {
    for (const dec of decorators) {
      const expr = dec.expression;
      if (expr.type !== 'CallExpression' || expr.callee?.type !== 'Identifier') continue;
      const decName = expr.callee.name;

      if ((decName === 'Prop' || decName === 'Column') && expr.arguments.length >= 1) {
        const arg = expr.arguments[0];
        if (arg.type === 'ObjectExpression') {
          for (const prop of arg.properties) {
            if (prop.type !== 'ObjectProperty' || prop.key?.type !== 'Identifier') continue;
            const propName = prop.key.name;

            if (propName === 'type') {
              const propType = extractPropType(prop.value);
              if (propType) {
                // @Prop type overrides TS annotation for the diagram
                if (field.type === 'unknown') field.type = propType;
                if (propType.endsWith('[]')) field.isArray = true;
              }
            }
            if (propName === 'required' && prop.value.type === 'BooleanLiteral') {
              field.required = prop.value.value;
            }
            if (propName === 'default') {
              if (prop.value.type === 'NullLiteral') field.defaultValue = 'null';
              else if (prop.value.type === 'BooleanLiteral') field.defaultValue = String(prop.value.value);
              else if (prop.value.type === 'NumericLiteral') field.defaultValue = String(prop.value.value);
              else if (prop.value.type === 'StringLiteral') field.defaultValue = `"${prop.value.value}"`;
              else if (prop.value.type === 'ArrayExpression') field.defaultValue = '[]';
            }
            if (propName === 'index' && prop.value.type === 'BooleanLiteral' && prop.value.value) {
              field.isIndex = true;
            }
            if (propName === 'unique' && prop.value.type === 'BooleanLiteral' && prop.value.value) {
              field.isUnique = true;
            }
            if (propName === 'enum') {
              field.isEnum = true;
            }
          }
        } else if (arg.type === 'Identifier') {
          // @Prop(SomeType) shorthand
          if (field.type === 'unknown') field.type = arg.name;
        }
      }
    }
  }

  // 3. Infer FK reference from field name
  if (fieldName.endsWith('Id') || fieldName.endsWith('_id')) {
    field.ref = fieldName.replace(/(_id|Id)$/, '');
  } else if (fieldName.endsWith('Ids') || fieldName.endsWith('_ids')) {
    field.ref = fieldName.replace(/(_ids|Ids)$/, '');
    field.isArray = true;
  }

  return field;
}

function resolveTypeAnnotation(node: any): string {
  if (!node) return 'unknown';

  switch (node.type) {
    case 'TSStringKeyword': return 'string';
    case 'TSNumberKeyword': return 'number';
    case 'TSBooleanKeyword': return 'boolean';
    case 'TSAnyKeyword': return 'any';
    case 'TSObjectKeyword': return 'Object';
    case 'TSVoidKeyword': return 'void';
    case 'TSNullKeyword': return 'null';
    case 'TSUndefinedKeyword': return 'undefined';

    case 'TSTypeReference':
      if (node.typeName?.type === 'Identifier') {
        const name = node.typeName.name;
        if (name === 'Date') return 'Date';
        if (name === 'ObjectId' || name === 'Types') return 'ObjectId';
        return name;
      }
      return 'Object';

    case 'TSArrayType':
      return resolveTypeAnnotation(node.elementType) + '[]';

    case 'TSUnionType':
      // e.g., string | null → just return the non-null type
      const nonNull = node.types?.filter((t: any) =>
        t.type !== 'TSNullKeyword' && t.type !== 'TSUndefinedKeyword'
      );
      if (nonNull?.length === 1) return resolveTypeAnnotation(nonNull[0]);
      if (nonNull?.length > 1) return resolveTypeAnnotation(nonNull[0]);
      return 'unknown';

    case 'TSTypeLiteral':
      return 'Object';

    case 'TSIntersectionType':
      return resolveTypeAnnotation(node.types?.[0]);

    default:
      return 'unknown';
  }
}

/**
 * Extract table schema from CREATE TABLE SQL statements.
 * Parses column definitions and creates ModelSchema entries.
 */
function extractCreateTableSchema(sql: string, filePath: string): void {
  const createPattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?(\w+)["`']?\s*\(([\s\S]*?)\)/gi;
  createPattern.lastIndex = 0;
  let match;

  while ((match = createPattern.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsStr = match[2];
    if (!tableName || SQL_KEYWORDS.has(tableName.toLowerCase())) continue;

    const modelName = toPascalCase(tableName);
    if (modelSchemasMap.has(modelName)) continue; // Don't override decorator-based schemas

    const fields: DatabaseField[] = [];
    const refFields = new Set<string>();

    // Parse column definitions
    const columnDefs = columnsStr.split(',').map(s => s.trim()).filter(Boolean);
    for (const colDef of columnDefs) {
      // Skip constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, INDEX, CONSTRAINT)
      const upperCol = colDef.toUpperCase().trim();
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|INDEX|CONSTRAINT|KEY)\b/.test(upperCol)) {
        // But extract FK relationships from FOREIGN KEY ... REFERENCES
        const fkMatch = colDef.match(/FOREIGN\s+KEY\s*\(["`']?(\w+)["`']?\)\s*REFERENCES\s+["`']?(\w+)["`']?/i);
        if (fkMatch) {
          joinRelationships.push({
            from: modelName,
            to: toPascalCase(fkMatch[2]),
            field: fkMatch[1],
            type: 'one-to-many',
          });
        }
        continue;
      }

      // Parse: column_name TYPE [constraints...]
      const colMatch = colDef.match(/^["`']?(\w+)["`']?\s+(\w+(?:\([^)]*\))?)\s*(.*)?$/i);
      if (!colMatch) continue;

      const colName = colMatch[1];
      const colType = colMatch[2].toLowerCase();
      const constraints = (colMatch[3] || '').toUpperCase();

      // Map SQL types to simpler types
      const typeMap: Record<string, string> = {
        varchar: 'string', text: 'string', char: 'string', nvarchar: 'string',
        int: 'number', integer: 'number', bigint: 'number', smallint: 'number',
        decimal: 'number', float: 'number', double: 'number', numeric: 'number', real: 'number',
        boolean: 'boolean', bool: 'boolean', bit: 'boolean',
        date: 'Date', datetime: 'Date', timestamp: 'Date', timestamptz: 'Date',
        json: 'Object', jsonb: 'Object',
        uuid: 'string', serial: 'number', bigserial: 'number',
        blob: 'Buffer', bytea: 'Buffer',
      };
      const baseType = colType.replace(/\(.*\)/, '');
      const mappedType = typeMap[baseType] || colType;

      const field: DatabaseField = {
        name: colName,
        type: mappedType,
        required: constraints.includes('NOT NULL'),
        isUnique: constraints.includes('UNIQUE') || constraints.includes('PRIMARY KEY'),
        isIndex: constraints.includes('PRIMARY KEY'),
      };

      // FK reference from column name
      if (colName.endsWith('_id') || colName.endsWith('Id')) {
        field.ref = colName.replace(/(_id|Id)$/, '');
        refFields.add(colName);
      }

      // REFERENCES in constraints
      const refMatch = constraints.match(/REFERENCES\s+["`']?(\w+)["`']?/i);
      if (refMatch) {
        field.ref = toPascalCase(refMatch[1]);
        refFields.add(colName);
        joinRelationships.push({
          from: modelName,
          to: toPascalCase(refMatch[1]),
          field: colName,
          type: 'one-to-many',
        });
      }

      if (constraints.includes('DEFAULT')) {
        const defMatch = constraints.match(/DEFAULT\s+(\S+)/i);
        if (defMatch) field.defaultValue = defMatch[1].toLowerCase();
      }

      fields.push(field);
    }

    if (fields.length > 0) {
      modelSchemasMap.set(modelName, { name: modelName, fields, file: filePath });
      if (refFields.size > 0) {
        modelFieldsMap.set(modelName, refFields);
      }
    }
  }
}

/**
 * Convert snake_case or plain table names to PascalCase model names.
 * e.g., "user_orders" → "UserOrders", "products" → "Products", "BOM" → "BOM"
 */
function extractDynamoDbTableInfo(
  objExpr: any,
  db: { files: Set<string>; models: Set<string>; operations: Set<string>; importedInCode: boolean; relationships: DatabaseRelationship[] },
  filePath: string,
): void {
  let tableName: string | null = null;

  for (const prop of objExpr.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;

    if (prop.key.name === 'TableName') {
      if (prop.value.type === 'StringLiteral') {
        tableName = prop.value.value;
        db.models.add(toPascalCase(prop.value.value));
      } else if (prop.value.type === 'Identifier') {
        // Variable reference — derive model name from variable
        const modelName = prop.value.name
          .replace(/_TABLE$/i, '')
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
          .replace(/\s/g, '');
        if (modelName) {
          db.models.add(modelName);
          tableName = modelName;
        }
      }
    }
  }

  // Extract key fields from Key property
  if (tableName) {
    extractDynamoDbFieldsFromObject(objExpr, /^[A-Z]/.test(tableName) ? tableName : toPascalCase(tableName), filePath);
  }
}

function extractDynamoDbFieldsFromObject(objExpr: any, modelName: string, filePath: string): void {
  if (!modelName) return;

  const fields: DatabaseField[] = [];

  for (const prop of objExpr.properties) {
    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;

    // Key: { InternalReference: value } → extract key field names
    if (prop.key.name === 'Key' && prop.value.type === 'ObjectExpression') {
      for (const keyProp of prop.value.properties) {
        if (keyProp.type === 'ObjectProperty' && keyProp.key.type === 'Identifier') {
          const existing = fields.find(f => f.name === keyProp.key.name);
          if (!existing) {
            fields.push({ name: keyProp.key.name, type: 'string', required: true, isIndex: true });
          }
        }
      }
    }

    // IndexName: 'SapIdentifierIndex' → note the index
    if (prop.key.name === 'IndexName' && prop.value.type === 'StringLiteral') {
      // Try to extract the indexed field name from the index name
      const indexName = prop.value.value;
      const fieldName = indexName.replace(/Index$/i, '');
      if (fieldName && !fields.find(f => f.name === fieldName)) {
        fields.push({ name: fieldName, type: 'string', isIndex: true });
      }
    }

    // Item: materialData → if we know the type, we could extract fields (skip for now)
  }

  // Merge fields into existing schema or create new one
  if (fields.length > 0) {
    const existing = modelSchemasMap.get(modelName);
    if (existing) {
      for (const field of fields) {
        if (!existing.fields.find(f => f.name === field.name)) {
          existing.fields.push(field);
        }
      }
    } else {
      modelSchemasMap.set(modelName, { name: modelName, fields, file: filePath });
    }
  }
}

function toPascalCase(name: string): string {
  // Already PascalCase
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return name;
  // ALL_CAPS (like BOM, AWS) — keep as is
  if (/^[A-Z_]+$/.test(name) && name.length <= 6) return name;

  return name
    .split(/[_\-\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function extractPropType(node: any): string | null {
  if (!node) return null;

  // @Prop({ type: String }) or @Prop({ type: Number })
  if (node.type === 'Identifier') {
    const map: Record<string, string> = {
      String: 'string', Number: 'number', Boolean: 'boolean',
      Date: 'Date', Object: 'Object', Buffer: 'Buffer',
    };
    return map[node.name] || node.name;
  }

  // @Prop({ type: [String] }) → string[]
  if (node.type === 'ArrayExpression' && node.elements?.length === 1) {
    const inner = extractPropType(node.elements[0]);
    return inner ? inner + '[]' : null;
  }

  return null;
}
