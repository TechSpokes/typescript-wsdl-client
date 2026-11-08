import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {validateMarkdownFile} from '../scripts/validate-docs.mjs';

async function validate(directory: string): Promise<void> {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await validate(file);
    else if (entry.name.endsWith('.md')) {
      for (const error of await validateMarkdownFile(file)) {
        console.error(`${error.file}:${error.line} ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
await validate('research');
if (!process.exitCode) console.log('Research documentation validation passed.');
