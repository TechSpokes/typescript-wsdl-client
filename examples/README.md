# Examples

This directory contains examples demonstrating various features of the TypeScript WSDL Client Generator.

## Available Examples

### 📁 minimal/
Basic WSDL file for testing and demonstration purposes.

- **File**: `weather.wsdl`
- **Description**: Simple SOAP weather service with 3 operations
- **Use Case**: Quick testing, smoke tests, minimal example

### 📁 openapi/
Configuration files for OpenAPI generation features.

- **Files**: `security.json`, `tags.json`, `ops.json`
- **Description**: Examples of security schemes, tag mappings, and operation overrides
- **Use Case**: Customizing OpenAPI spec generation

### 📁 gateway/ ⭐ NEW
Complete Fastify REST API gateway generation example.

- **What it demonstrates**:
  - Generating Fastify gateway code from WSDL
  - JSON Schema validation with URN-based IDs
  - Route registration and handler implementation
  - Standard response envelope pattern
  - Complete working server example

- **Quick Start**:
  ```bash
  cd gateway
  npm run generate    # Generate gateway code
  npm install        # Install dependencies
  npm run dev        # Run server
  ```

- **Documentation**:
  - `README.md` - Complete guide with integration patterns
  - `QUICK-REFERENCE.md` - Command reference and tips
  - `TESTING.md` - Testing strategies and examples
  - `server.ts` - Working Fastify server
  - `handler-implementation.ts` - Handler implementation patterns

## Common Workflows

### 1. Generate TypeScript Client Only

```bash
npx wsdl-tsc --wsdl examples/minimal/weather.wsdl --out generated
```

### 2. Generate Client + OpenAPI

```bash
npx wsdl-tsc openapi --wsdl examples/minimal/weather.wsdl --out openapi.json
```

### 3. Generate Client + OpenAPI + Gateway (Complete Pipeline)

```bash
npx wsdl-tsc pipeline \
  --wsdl examples/minimal/weather.wsdl \
  --out generated \
  --format both \
  --gateway-out generated/gateway \
  --gateway-version v1 \
  --gateway-service weather
```

## Output Structure

After running the complete pipeline, you'll have:

```
generated/
├── client.ts              # SOAP client class
├── types.ts               # TypeScript type definitions
├── utils.ts               # Runtime utilities (marshal/unmarshal)
├── catalog.json           # Metadata (if --catalog enabled)
├── openapi.json           # OpenAPI 3.1 spec (if OpenAPI enabled)
├── openapi.yaml           # YAML format (if --format both/yaml)
└── gateway/               # Fastify gateway (if --gateway-out specified)
    ├── schemas/
    │   ├── models/       # JSON Schema files
    │   └── operations/   # Fastify operation schemas
    ├── routes/           # Route handlers
    ├── schemas.ts        # Schema registration
    └── routes.ts         # Route registration
```

## Feature Examples

### Using Security Configuration

```bash
npx wsdl-tsc openapi \
  --wsdl examples/minimal/weather.wsdl \
  --out openapi.json \
  --security examples/openapi/security.json
```

### Using Custom Tags

```bash
npx wsdl-tsc openapi \
  --wsdl examples/minimal/weather.wsdl \
  --out openapi.json \
  --tags examples/openapi/tags.json
```

### Using Operation Overrides

```bash
npx wsdl-tsc openapi \
  --wsdl examples/minimal/weather.wsdl \
  --out openapi.json \
  --ops examples/openapi/ops.json
```

## Learn More

- **Main README**: `../README.md` - Project overview and installation
- **Contributing**: `../CONTRIBUTING.md` - Development workflow
- **Gateway Example**: `gateway/README.md` - Comprehensive gateway guide
- **API Reference**: Generated TypeScript types provide full IntelliSense

## Support

- 🐛 [Report Issues](https://github.com/techspokes/typescript-wsdl-client/issues)
- 💬 [Discussions](https://github.com/techspokes/typescript-wsdl-client/discussions)
- 📖 [Documentation](../README.md)

