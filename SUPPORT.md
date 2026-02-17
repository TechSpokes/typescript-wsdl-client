# Getting Support

Need help with `typescript-wsdl-client`? Here is how to get the assistance you need.

## Self-Help Resources

Start here for quick answers:

- [README.md](./README.md) for installation, quick start, and documentation links
- [docs/](./docs/) for CLI reference, API reference, concepts, gateway guide, and more
- [Examples](./examples/) for sample WSDL files, generated output, and project templates
- [CHANGELOG.md](./CHANGELOG.md) for recent changes and breaking changes
- [docs/migration.md](./docs/migration.md) for upgrade guidance between versions
- `npx wsdl-tsc --help` and `npx wsdl-tsc <command> --help` for CLI reference
- `cat catalog.json | jq '.types'` to inspect compiled WSDL types for debugging
- `npm run smoke:pipeline` or `npm run ci` to verify setup

## Community Support

### GitHub Discussions (Recommended)

Start here for most questions and community interaction:

- [Questions & Help](../../discussions/categories/q-a) for technical questions and troubleshooting
- [Feature Ideas](../../discussions/categories/ideas) for suggestions and improvements
- [Show and Tell](../../discussions/categories/show-and-tell) for sharing projects
- [General Discussion](../../discussions/categories/general) for open conversations

### GitHub Issues

Use issues for confirmed bugs only:

- [Bug Reports](../../issues) for reproducible problems
- Include WSDL details, the command used, error output, and environment info

Please use Discussions for questions; it keeps issues focused on actionable bugs.

## Response Times

Discussions are usually answered within 24-48 hours by maintainers. Bugs are prioritized and typically addressed within one week. Other users in the community often help quickly.

Quick questions are often answered the same day. Complex issues may need back-and-forth to understand context. Feature requests are discussed in the community before implementation. Bug fixes are prioritized based on severity and impact.

## Before Asking for Help

Help us help you by providing:

### Environment Details

- Node.js version (`node --version`)
- TypeScript version
- Operating system
- Package manager (npm/yarn/pnpm)

### Command Used

```bash
npx wsdl-tsc pipeline --wsdl-source your-service.wsdl --client-dir ./generated
```

### WSDL Information (Without Sensitive Data)

- Source or vendor if public
- Approximate complexity
- Any special authentication or features

### Error Output

- Complete error messages
- Stack traces if available

### Expected vs Actual Behavior

- What you expected to happen
- What actually happened

## Security Issues

Do not post security vulnerabilities in public discussions or issues.

Follow our [Security Policy](./SECURITY.md). Report vulnerabilities privately via the [contact page](https://www.techspokes.com/contact/). Include detailed reproduction steps. We will respond within 72 hours.

## Contributing Back

Found a solution? Help others by answering questions in discussions, improving documentation with what you learned, sharing examples of successful integrations, and reporting bugs you discover.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

## Support Channels Summary

| Need | Channel | Response Time | Best For |
|------|---------|---------------|----------|
| Quick question | [Discussions Q&A](../../discussions/categories/q-a) | 24-48h | Learning, troubleshooting |
| Feature idea | [Discussions Ideas](../../discussions/categories/ideas) | 1-7 days | Suggestions, feedback |
| Confirmed bug | [GitHub Issues](../../issues) | 1-7 days | Reproducible problems |
| Security issue | [Contact page](https://www.techspokes.com/contact/) | 72h | Vulnerabilities |
