/** Test-only installed private binding; never copied into generated production source. */
import assert from 'node:assert/strict';
import {realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {DirectClientRuntime} from '../../src/client/directClientRuntime.js';

const root = await realpath(process.cwd());
const installed = await realpath(path.join(root, 'node_modules/@techspokes/typescript-wsdl-client'));
assert.equal(installed, path.join(root, 'node_modules/@techspokes/typescript-wsdl-client'));
const runtimeFile = await realpath(path.join(installed, 'dist/client/directClientRuntime.js'));
assert.equal(runtimeFile, path.join(installed, 'dist/client/directClientRuntime.js'));
const {directClientRuntime}: {directClientRuntime: DirectClientRuntime} = await import(pathToFileURL(runtimeFile).href);
import {exerciseGenerated} from './generatedDirectConsumer.ts';
await exerciseGenerated(directClientRuntime, true);
