#!/usr/bin/env bash
# Generate SOAP client, OpenAPI spec, and Fastify gateway from WSDL.
# Usage: ./generate.sh <wsdl-url> <service-name>
#
# Example:
#   ./generate.sh https://example.com/service?wsdl my-service
#
# This script is CI-system agnostic. Call it from GitHub Actions,
# GitLab CI, Jenkins, or any shell environment.

set -euo pipefail

WSDL_URL="${1:?Usage: generate.sh <wsdl-url> <service-name>}"
SERVICE_NAME="${2:?Usage: generate.sh <wsdl-url> <service-name>}"
OUTPUT_DIR="${3:-./src/generated}"

echo "Generating from: ${WSDL_URL}"
echo "Service name:    ${SERVICE_NAME}"
echo "Output dir:      ${OUTPUT_DIR}"

npx wsdl-tsc pipeline \
  --wsdl-source "${WSDL_URL}" \
  --client-dir "${OUTPUT_DIR}/client" \
  --openapi-file "${OUTPUT_DIR}/openapi.json" \
  --gateway-dir "${OUTPUT_DIR}/gateway" \
  --gateway-service-name "${SERVICE_NAME}" \
  --gateway-version-prefix v1 \
  --clean

echo "Generation complete. Verify with: npx tsc --noEmit"
