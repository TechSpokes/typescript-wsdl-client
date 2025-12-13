# Testing the Gateway

This guide provides comprehensive testing examples for the generated Fastify gateway.

## Prerequisites

```bash
# 1. Generate gateway code
cd examples/gateway
npm run generate

# 2. Install dependencies
npm install

# 3. Start the server
npm run dev
```

## Testing with cURL

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 123.456
}
```

### API Documentation

```bash
curl http://localhost:3000/
```

### Get City Weather by ZIP

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{"ZIP": "90210"}'
```

Expected response (with stub handler):
```json
{
  "statusCode": 500,
  "error": "Internal Server Error",
  "message": "Not implemented"
}
```

Expected response (with implemented handler):
```json
{
  "status": "SUCCESS",
  "message": null,
  "data": {
    "Success": true,
    "State": "CA",
    "City": "Beverly Hills",
    "Temperature": "72",
    "Description": "Sunny"
  },
  "error": null
}
```

### Get City Forecast by ZIP

```bash
curl -X POST http://localhost:3000/get-city-forecast-by-zip \
  -H "Content-Type: application/json" \
  -d '{"ZIP": "10001"}'
```

### Validation Error Example

Send invalid data to test schema validation:

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{"invalid": "field"}'
```

Expected response:
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body must have required property 'ZIP'"
}
```

## Testing with HTTPie

[HTTPie](https://httpie.io/) provides a more user-friendly CLI:

```bash
# Install HTTPie
pip install httpie

# Health check
http GET localhost:3000/health

# Get weather
http POST localhost:3000/get-city-weather-by-zip ZIP=90210

# Pretty output with colors
http --pretty=all POST localhost:3000/get-city-weather-by-zip ZIP=10001
```

## Testing with Postman

### Import Collection

Create a Postman collection with these requests:

1. **Health Check**
   - Method: GET
   - URL: `http://localhost:3000/health`

2. **Get Weather**
   - Method: POST
   - URL: `http://localhost:3000/get-city-weather-by-zip`
   - Headers: `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "ZIP": "90210"
     }
     ```

3. **Get Forecast**
   - Method: POST
   - URL: `http://localhost:3000/get-city-forecast-by-zip`
   - Headers: `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "ZIP": "10001"
     }
     ```

## Testing with JavaScript/TypeScript

### Using fetch

```typescript
// test-client.ts
async function testGateway() {
  const response = await fetch('http://localhost:3000/get-city-weather-by-zip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ZIP: '90210',
    }),
  });
  
  const data = await response.json();
  console.log('Response:', data);
}

testGateway();
```

### Using axios

```typescript
import axios from 'axios';

async function testWithAxios() {
  try {
    const response = await axios.post(
      'http://localhost:3000/get-city-weather-by-zip',
      { ZIP: '90210' }
    );
    
    console.log('Status:', response.data.status);
    console.log('Data:', response.data.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error:', error.response?.data);
    }
  }
}
```

## Automated Testing

### Using Fastify's inject method

```typescript
// test.spec.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { build } from './server.js'; // Export your fastify instance

test('GET /health returns ok status', async (t) => {
  const app = await build();
  
  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });
  
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, 'ok');
});

test('POST /get-city-weather-by-zip validates schema', async (t) => {
  const app = await build();
  
  const response = await app.inject({
    method: 'POST',
    url: '/get-city-weather-by-zip',
    payload: {
      ZIP: '90210',
    },
  });
  
  assert.equal(response.statusCode, 500); // Stub throws error
});

test('POST with invalid data returns 400', async (t) => {
  const app = await build();
  
  const response = await app.inject({
    method: 'POST',
    url: '/get-city-weather-by-zip',
    payload: {
      invalid: 'field',
    },
  });
  
  assert.equal(response.statusCode, 400);
});
```

## Load Testing

### Using autocannon

```bash
# Install autocannon
npm install -g autocannon

# Simple load test
autocannon -c 10 -d 10 http://localhost:3000/health

# POST request load test
autocannon -c 10 -d 10 -m POST \
  -H "Content-Type: application/json" \
  -b '{"ZIP":"90210"}' \
  http://localhost:3000/get-city-weather-by-zip
```

### Using k6

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({
    ZIP: '90210',
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  const res = http.post(
    'http://localhost:3000/get-city-weather-by-zip',
    payload,
    params
  );
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has data': (r) => JSON.parse(r.body).data !== null,
  });
  
  sleep(1);
}
```

Run with: `k6 run load-test.js`

## Schema Validation Testing

Test that Fastify properly validates requests against the generated schemas:

### Valid Request

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{"ZIP": "90210"}'
```

Should pass validation ✅

### Invalid Type

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{"ZIP": 90210}'  # Number instead of string
```

Should fail validation ❌

### Missing Required Field

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{}'
```

Should fail validation ❌

### Extra Fields

```bash
curl -X POST http://localhost:3000/get-city-weather-by-zip \
  -H "Content-Type: application/json" \
  -d '{"ZIP": "90210", "extraField": "value"}'
```

Behavior depends on schema's `additionalProperties` setting

## Monitoring

### View Logs

The server uses Pino logger with pretty printing enabled:

```bash
# Run server with info level (default)
npm run dev

# Run with debug level
LOG_LEVEL=debug npm run dev

# Run with trace level
LOG_LEVEL=trace npm run dev
```

### Check Process

```bash
# Find the process
ps aux | grep server.ts

# Monitor resource usage
top -p $(pgrep -f server.ts)
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Gateway Code Not Found

```bash
# Regenerate gateway code
npm run generate
```

### Schema Validation Failing

Check that your request matches the expected schema:

```bash
# View the operation schema
cat ../../tmp/gateway/schemas/operations/getcityweatherbyzip.json | jq
```

### CORS Issues

Add CORS headers (already included in server.ts example) or use a browser extension to bypass CORS during development.

## Next Steps

1. Implement actual SOAP client calls (see `handler-implementation.ts`)
2. Add authentication/authorization
3. Add rate limiting
4. Add request/response logging
5. Deploy to production

