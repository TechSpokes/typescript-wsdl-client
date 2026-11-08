import {describe, expect, it} from 'vitest';
import {findMissingPackageLinks, validatePackageFiles} from '../../scripts/validate-npm-package.js';

describe('installed package documentation', () => {
  it('catches links that exist only in the repository, including nested relative paths', () => {
    const text: Record<string, string> = {
      'README.md': '[Research](research/README.md)',
      'docs/guide.md': '[Contributor guide](../CONTRIBUTING.md)',
    };
    const errors = findMissingPackageLinks(Object.keys(text), file => text[file]!);
    expect(errors).toEqual([
      'README.md:1 package link is missing: research/README.md',
      'docs/guide.md:1 package link is missing: ../CONTRIBUTING.md',
    ]);
  });

  it('accepts packaged files, escaped names, local headings and repository URLs while ignoring code fences', () => {
    const text: Record<string, string> = {
      'README.md': '[Guide](docs/a%20guide.md#setup)\n[Online](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/README.md)\n```text\n[Example](not-a-real-file)\n```',
      'docs/a guide.md': '# Setup\n[Here](#setup)\n[Home](../README.md)',
    };
    expect(findMissingPackageLinks(Object.keys(text), file => text[file]!)).toEqual([]);
  });

  it.each([
    'research/docs/note.md', 'docs/releases/v1.1.7.md', 'dist/index.d.ts.map',
    'dist/runtime/streamXml.js', 'dist/runtime/ndjson.d.ts', 'src/runtime/jsonArray.ts', 'src/runtime/ndjson.ts',
  ])('rejects unused or development payload %s', file => {
    expect(() => validatePackageFiles([file], () => '# Note')).toThrow(`Forbidden package file: ${file}`);
  });

  it('rejects missing generation resources independently of package size', () => {
    expect(() => validatePackageFiles([], () => '')).toThrow('Required package file is missing: dist/cli.js');
    expect(() => validatePackageFiles([], () => '')).toThrow('Required package file is missing: src/runtime/checkedGatewayHost.tpl.txt');
    expect(() => validatePackageFiles([], () => '')).toThrow('Required package file is missing: src/runtime/streamXml.ts');
    expect(() => validatePackageFiles([], () => '')).toThrow('Required package file is missing: src/generation/preambles/direct-client/typescript.preamble');
  });

  it('rejects dangling source navigation footers in declarations', () => {
    expect(() => validatePackageFiles(['dist/index.d.ts'], () => 'export {};\n//# sourceMappingURL=index.d.ts.map\n'))
      .toThrow('Declaration map footer is not supported: dist/index.d.ts');
  });
});
