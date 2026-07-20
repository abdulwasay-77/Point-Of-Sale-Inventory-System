// Standalone Prisma schema validator — does NOT need the Prisma engine
// binaries (which this sandbox can't download). Parses schema.prisma
// with regex/text-scanning and checks the things that most commonly go
// wrong when hand-editing a schema:
//   1. Every `Type` used as a field type is either a Prisma primitive, a
//      declared enum, or a declared model.
//   2. Every `@relation(fields: [...], references: [...])` points at
//      fields that actually exist on both sides.
//   3. Every model with a `X[]` relation field has a matching scalar/
//      object relation field on the other side (basic bidirectionality).
//   4. No duplicate field names within a model.
const fs = require('fs');

const schema = fs.readFileSync(process.argv[2] || 'prisma/schema.prisma', 'utf8');

const PRIMITIVES = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Decimal', 'Json', 'BigInt', 'Bytes']);

function stripComments(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const clean = stripComments(schema);

// --- Parse enums ---
const enums = {};
for (const m of clean.matchAll(/enum\s+(\w+)\s*{([^}]*)}/g)) {
  const [, name, body] = m;
  enums[name] = body.split('\n').map((l) => l.trim()).filter(Boolean);
}

// --- Parse models ---
const models = {};
for (const m of clean.matchAll(/model\s+(\w+)\s*{([^}]*)}/g)) {
  const [, name, body] = m;
  const fields = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('@@')) continue;
    const fieldMatch = trimmed.match(/^(\w+)\s+([\w[\]?]+)(.*)$/);
    if (!fieldMatch) continue;
    const [, fieldName, rawType, attrs] = fieldMatch;
    fields.push({ name: fieldName, rawType, attrs, line: trimmed });
  }
  models[name] = fields;
}

let errors = [];
let warnings = [];

// Check 1 & 4: type resolution + duplicate field names
for (const [modelName, fields] of Object.entries(models)) {
  const seen = new Set();
  for (const f of fields) {
    if (seen.has(f.name)) errors.push(`${modelName}.${f.name}: duplicate field name`);
    seen.add(f.name);

    const baseType = f.rawType.replace(/[[\]?]/g, '');
    if (!PRIMITIVES.has(baseType) && !enums[baseType] && !models[baseType]) {
      errors.push(`${modelName}.${f.name}: unknown type "${baseType}"`);
    }
  }
}

// Check 2: every @relation(fields: [...], references: [...]) resolves
for (const [modelName, fields] of Object.entries(models)) {
  for (const f of fields) {
    const relMatch = f.attrs.match(/@relation\(([^)]*)\)/);
    if (!relMatch) continue;
    const relBody = relMatch[1];
    const fieldsMatch = relBody.match(/fields:\s*\[([^\]]*)\]/);
    const referencesMatch = relBody.match(/references:\s*\[([^\]]*)\]/);
    if (!fieldsMatch || !referencesMatch) continue; // back-relation side, no fields/references

    const localFields = fieldsMatch[1].split(',').map((s) => s.trim());
    const remoteFields = referencesMatch[1].split(',').map((s) => s.trim());
    const remoteModelName = f.rawType.replace(/[?]/g, '');

    for (const lf of localFields) {
      if (!fields.some((ff) => ff.name === lf)) {
        errors.push(`${modelName}.${f.name}: @relation fields references nonexistent local field "${lf}"`);
      }
    }
    const remoteFieldsList = models[remoteModelName];
    if (!remoteFieldsList) {
      errors.push(`${modelName}.${f.name}: @relation target model "${remoteModelName}" does not exist`);
      continue;
    }
    for (const rf of remoteFields) {
      if (!remoteFieldsList.some((ff) => ff.name === rf)) {
        errors.push(`${modelName}.${f.name}: @relation references nonexistent field "${rf}" on ${remoteModelName}`);
      }
    }
  }
}

// Check 3: every list relation (Foo[]) without @relation(fields:...) —
// i.e. a "back-relation" — should point at a model that has some field
// typed back at this model (either the owning side or another back-relation).
for (const [modelName, fields] of Object.entries(models)) {
  for (const f of fields) {
    const isListRelation = f.rawType.endsWith('[]');
    const baseType = f.rawType.replace(/[[\]?]/g, '');
    if (!isListRelation || !models[baseType] || f.attrs.includes('@relation(fields:')) continue;
    const remoteFields = models[baseType];
    const hasBackRef = remoteFields.some((rf) => rf.rawType.replace(/[[\]?]/g, '') === modelName);
    if (!hasBackRef) {
      warnings.push(`${modelName}.${f.name}: no field on ${baseType} references back to ${modelName} (possible orphan relation)`);
    }
  }
}

console.log(`Parsed ${Object.keys(models).length} models, ${Object.keys(enums).length} enums.`);
console.log(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
if (errors.length) {
  console.log('\n--- ERRORS ---');
  errors.forEach((e) => console.log('✗ ' + e));
}
if (warnings.length) {
  console.log('\n--- WARNINGS ---');
  warnings.forEach((w) => console.log('! ' + w));
}
process.exit(errors.length ? 1 : 0);
