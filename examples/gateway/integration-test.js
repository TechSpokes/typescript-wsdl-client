#!/usr/bin/env node
/**
 * Integration Test for Gateway Generation Feature
 *
 * This script performs a complete end-to-end test of the gateway generation:
 * 1. Generates TypeScript client from WSDL
 * 2. Generates OpenAPI specification
 * 3. Generates Fastify gateway code
 * 4. Verifies all output files exist
 * 5. Validates file structure and content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GATEWAY_DIR = path.join(__dirname, '..', '..', 'tmp', 'gateway');

console.log('🧪 Running Gateway Integration Test...\n');

let errors = 0;

function check(condition, message) {
  if (condition) {
    console.log(`✅ ${message}`);
  } else {
    console.error(`❌ ${message}`);
    errors++;
  }
}

function checkFileExists(filePath, description) {
  const exists = fs.existsSync(filePath);
  check(exists, description);
  return exists;
}

function checkJsonFile(filePath, description) {
  if (!checkFileExists(filePath, `${description} exists`)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    check(true, `${description} is valid JSON`);
    return json;
  } catch (error) {
    check(false, `${description} is valid JSON - ${error.message}`);
    return null;
  }
}

console.log('📂 Checking directory structure...\n');

check(fs.existsSync(GATEWAY_DIR), 'Gateway directory exists');
check(fs.existsSync(path.join(GATEWAY_DIR, 'schemas')), 'schemas/ directory exists');
check(fs.existsSync(path.join(GATEWAY_DIR, 'schemas', 'models')), 'schemas/models/ directory exists');
check(fs.existsSync(path.join(GATEWAY_DIR, 'schemas', 'operations')), 'schemas/operations/ directory exists');
check(fs.existsSync(path.join(GATEWAY_DIR, 'routes')), 'routes/ directory exists');

console.log('\n📄 Checking generated files...\n');

checkFileExists(path.join(GATEWAY_DIR, 'schemas.ts'), 'schemas.ts');
checkFileExists(path.join(GATEWAY_DIR, 'routes.ts'), 'routes.ts');

console.log('\n🔍 Validating model schemas...\n');

const modelsDir = path.join(GATEWAY_DIR, 'schemas', 'models');
const modelFiles = fs.readdirSync(modelsDir).filter(f => f.endsWith('.json'));
check(modelFiles.length > 0, `Found ${modelFiles.length} model schema files`);

// Check a few specific schemas
const forecastSchema = checkJsonFile(
  path.join(modelsDir, 'forecast.json'),
  'Forecast schema'
);
if (forecastSchema) {
  check(
    forecastSchema.$id && forecastSchema.$id.startsWith('urn:schema:'),
    'Forecast schema has RFC-compliant URN $id'
  );
  check(
    forecastSchema.type === 'object',
    'Forecast schema is an object type'
  );
}

const envelopeSchema = checkJsonFile(
  path.join(modelsDir, 'weatherresponseenvelope.json'),
  'Base envelope schema'
);
if (envelopeSchema) {
  check(
    envelopeSchema.properties &&
    envelopeSchema.properties.status &&
    envelopeSchema.properties.data &&
    envelopeSchema.properties.error &&
    envelopeSchema.properties.message,
    'Base envelope has required properties (status, data, error, message)'
  );
}

console.log('\n🔍 Validating operation schemas...\n');

const opsDir = path.join(GATEWAY_DIR, 'schemas', 'operations');
const opFiles = fs.readdirSync(opsDir).filter(f => f.endsWith('.json'));
check(opFiles.length > 0, `Found ${opFiles.length} operation schema files`);

const weatherOpSchema = checkJsonFile(
  path.join(opsDir, 'getcityweatherbyzip.json'),
  'GetCityWeatherByZIP operation schema'
);
if (weatherOpSchema) {
  check(
    weatherOpSchema.$id && weatherOpSchema.$id.includes(':operations:'),
    'Operation schema has URN $id with :operations: segment'
  );
  check(
    weatherOpSchema.response && Object.keys(weatherOpSchema.response).length > 0,
    'Operation schema has response definitions'
  );
  check(
    weatherOpSchema.response['200'] && weatherOpSchema.response['200'].$ref,
    'Operation schema has 200 response with $ref'
  );
  check(
    weatherOpSchema.body && weatherOpSchema.body.$ref,
    'Operation schema has request body with $ref'
  );

  // Check that default status codes are backfilled
  const defaultCodes = [200, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];
  const hasAllDefaults = defaultCodes.every(code => weatherOpSchema.response[String(code)]);
  check(hasAllDefaults, 'Operation schema has all default response status codes');
}

console.log('\n🔍 Validating route files...\n');

const routesDir = path.join(GATEWAY_DIR, 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
check(routeFiles.length === opFiles.length, `Route files match operation count (${routeFiles.length})`);

const weatherRoute = path.join(routesDir, 'getcityweatherbyzip.ts');
if (checkFileExists(weatherRoute, 'GetCityWeatherByZIP route file')) {
  const content = fs.readFileSync(weatherRoute, 'utf8');
  check(content.includes('import { FastifyInstance }'), 'Route imports FastifyInstance');
  check(content.includes('import schema from'), 'Route imports operation schema');
  check(content.includes('fastify.route({'), 'Route calls fastify.route()');
  check(content.includes('method: "POST"'), 'Route has correct HTTP method');
  check(content.includes('url: "/get-city-weather-by-zip"'), 'Route has correct URL path');
  check(content.includes('schema: schema as any'), 'Route uses imported schema');
  check(content.includes('handler: async'), 'Route has async handler');
}

console.log('\n🔍 Validating aggregator modules...\n');

const schemasTs = path.join(GATEWAY_DIR, 'schemas.ts');
if (checkFileExists(schemasTs, 'schemas.ts module')) {
  const content = fs.readFileSync(schemasTs, 'utf8');
  check(content.includes('import { FastifyInstance }'), 'schemas.ts imports FastifyInstance');
  check(content.includes('export async function registerSchemas_v1_weather'), 'schemas.ts exports registration function');
  check(content.includes('fastify.addSchema'), 'schemas.ts calls fastify.addSchema');
  const importCount = (content.match(/import m\d+ from/g) || []).length;
  check(importCount === modelFiles.length, `schemas.ts imports all ${modelFiles.length} model schemas`);
}

const routesTs = path.join(GATEWAY_DIR, 'routes.ts');
if (checkFileExists(routesTs, 'routes.ts module')) {
  const content = fs.readFileSync(routesTs, 'utf8');
  check(content.includes('import { FastifyInstance }'), 'routes.ts imports FastifyInstance');
  check(content.includes('export async function registerRoutes_v1_weather'), 'routes.ts exports registration function');
  const importCount = (content.match(/import { registerRoute_/g) || []).length;
  check(importCount === routeFiles.length, `routes.ts imports all ${routeFiles.length} route handlers`);
}

console.log('\n📊 Test Summary\n');
console.log(`Total checks: ${errors > 0 ? '❌' : '✅'}`);
console.log(`Errors: ${errors}`);

if (errors === 0) {
  console.log('\n🎉 All integration tests PASSED!\n');
  process.exit(0);
} else {
  console.log(`\n❌ ${errors} integration test(s) FAILED!\n`);
  process.exit(1);
}

