/** P3.8 installed consumer uses the documented root binding only. */
import assert from 'node:assert/strict';
import * as packageRoot from '@techspokes/typescript-wsdl-client';
import {exerciseGenerated} from './generatedDirectConsumer.ts';
assert.equal('directClientRuntime' in packageRoot, false);
assert.equal('generateDirectClient' in packageRoot, false);
assert.equal(typeof packageRoot.compileWsdlToProject, 'function');
await exerciseGenerated(packageRoot.checkedDirectRuntimeV1);
