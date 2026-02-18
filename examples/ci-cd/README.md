# CI/CD Integration Example

Sample workflows for automating WSDL-to-TypeScript code generation in CI pipelines.

## GitHub Actions

See [generate.yml](.github/workflows/generate.yml) for a complete workflow that:

1. Fetches the WSDL from a remote URL
2. Runs the full generation pipeline
3. Commits the generated code if it changed

## Shell Script

See [generate.sh](generate.sh) for a reusable generation script suitable for any CI system.

## Key Considerations

- Always generate from the authoritative WSDL URL, not a cached copy
- Commit generated code to the repository so consumers don't need wsdl-tsc installed
- Use `--clean` to remove stale files from previous generations
- Pin the wsdl-tsc version in `package.json` for reproducible builds
- Run `tsc --noEmit` after generation to verify the output compiles
