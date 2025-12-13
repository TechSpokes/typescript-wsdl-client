/**
 * Fastify Gateway Server Example
 *
 * This example demonstrates how to integrate the generated gateway code
 * with a Fastify server and implement handlers that call the SOAP service.
 *
 * Usage:
 *   1. Generate gateway code:
 *      npx wsdl-tsc pipeline --wsdl examples/minimal/weather.wsdl --out tmp \
 *        --gateway-out tmp/gateway --gateway-version v1 --gateway-service weather
 *
 *   2. Install dependencies:
 *      npm install fastify
 *
 *   3. Run this server:
 *      npx tsx examples/gateway/server.ts
 *
 *   4. Test with curl:
 *      curl -X POST http://localhost:3000/get-city-weather-by-zip \
 *        -H "Content-Type: application/json" \
 *        -d '{"ZIP": "90210"}'
 */

import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';

// Configuration
const PORT = 3000;
const HOST = '0.0.0.0';
const GATEWAY_DIR = path.join(process.cwd(), 'tmp', 'gateway');

// Check if gateway code exists
if (!fs.existsSync(GATEWAY_DIR)) {
  console.error('❌ Gateway code not found at:', GATEWAY_DIR);
  console.error('');
  console.error('Please generate gateway code first:');
  console.error('  npx wsdl-tsc pipeline --wsdl examples/minimal/weather.wsdl --out tmp \\');
  console.error('    --gateway-out tmp/gateway --gateway-version v1 --gateway-service weather');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify({
  logger: true,
});

// Add CORS support (optional)
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    reply.code(200).send();
  }
});

// Health check endpoint
fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
});

// API documentation endpoint
fastify.get('/', async () => {
  return {
    service: 'Weather SOAP Gateway',
    version: 'v1',
    endpoints: [
      'GET  /health - Health check',
      'GET  / - This documentation',
      'POST /get-city-forecast-by-zip - Get weather forecast by ZIP code',
      'POST /get-city-weather-by-zip - Get current weather by ZIP code',
      'POST /get-weather-information - Get weather information',
    ],
    example: {
      url: 'POST http://localhost:3000/get-city-weather-by-zip',
      headers: { 'Content-Type': 'application/json' },
      body: { ZIP: '90210' },
    },
  };
});

/**
 * Dynamically import and register gateway modules
 */
async function registerGateway() {
  try {
    // Import the generated schema registration module
    const schemasModulePath = path.join(GATEWAY_DIR, 'schemas.js');
    const schemasModuleUrl = new URL(`file:///${schemasModulePath.replace(/\\/g, '/')}`);
    const { registerSchemas_v1_weather } = await import(schemasModuleUrl.href);

    // Import the generated route registration module
    const routesModulePath = path.join(GATEWAY_DIR, 'routes.js');
    const routesModuleUrl = new URL(`file:///${routesModulePath.replace(/\\/g, '/')}`);
    const { registerRoutes_v1_weather } = await import(routesModuleUrl.href);

    // Register all schemas with Fastify
    console.log('📋 Registering JSON schemas...');
    await registerSchemas_v1_weather(fastify);

    // Register all routes with Fastify
    console.log('🚀 Registering routes...');
    await registerRoutes_v1_weather(fastify);

    console.log('✅ Gateway registered successfully');
  } catch (error) {
    console.error('❌ Failed to register gateway:', error);
    throw error;
  }
}

/**
 * Example: Override route handlers with actual implementations
 *
 * The generated routes have stub handlers that throw "Not implemented".
 * You can override them after registration or modify the generated files directly.
 */
function setupCustomHandlers() {
  // Example: Add custom error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    // Map errors to standard envelope format
    const err = error as any;
    const statusCode = err.statusCode || 500;
    const errorResponse = {
      status: 'FAILURE',
      message: err.message || 'Internal server error',
      data: null,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : null,
      },
    };

    reply.code(statusCode).send(errorResponse);
  });

  // Example: Add request logging
  fastify.addHook('onRequest', async (request) => {
    request.log.info({
      method: request.method,
      url: request.url,
      body: request.body,
    }, 'Incoming request');
  });

  // Example: Add response logging
  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'Request completed');
  });
}

/**
 * Start the server
 */
async function start() {
  try {
    console.log('🔧 Initializing Fastify Gateway Server...');
    console.log('');

    // Register gateway code (schemas and routes)
    await registerGateway();

    // Setup custom handlers and hooks
    setupCustomHandlers();

    // Start listening
    await fastify.listen({ port: PORT, host: HOST });

    console.log('');
    console.log('✨ Server is running!');
    console.log('');
    console.log(`📍 Local:   http://localhost:${PORT}`);
    console.log(`📍 Network: http://${HOST}:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET  /health - Health check');
    console.log('  GET  /       - API documentation');
    console.log('  POST /get-city-forecast-by-zip');
    console.log('  POST /get-city-weather-by-zip');
    console.log('  POST /get-weather-information');
    console.log('');
    console.log('⚠️  Note: Route handlers are stubs and will throw "Not implemented"');
    console.log('    See examples/gateway/handler-implementation.ts for implementation examples');
    console.log('');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('');
  console.log('🛑 Shutting down server...');
  await fastify.close();
  console.log('✅ Server stopped');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
start();

