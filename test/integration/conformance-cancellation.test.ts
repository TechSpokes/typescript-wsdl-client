import {existsSync, readdirSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {capabilities} from '../conformance/registry.js';
import {runAppCase, runClientCase, runCompileCase, runGatewayCase, runGeneratedTestsCase, runOpenApiCase} from '../conformance/runner.js';

describe('conformance caller cancellation', () => {
  it('rejects every stage before allocating output for an already cancelled caller', async () => {
    const capability = {...capabilities.find(row => row.client && row.gateway && row.generatedTests && row.app)!,
      id: 'cancelled-conformance-control'};
    const outputs = () => existsSync('tmp/conformance')
      ? readdirSync('tmp/conformance').filter(name => name.startsWith(capability.id + '-')).sort() : [];
    const before = outputs();
    const reason = new Error('cancelled conformance qualification');
    for (const run of [runCompileCase, runClientCase, runOpenApiCase, runGatewayCase, runGeneratedTestsCase, runAppCase]) {
      await expect(run(capability, AbortSignal.abort(reason))).rejects.toBe(reason);
    }
    expect(outputs()).toEqual(before);
  });

  it('does not turn caller cancellation into successful expected WSDL rejection', async () => {
    const capability = capabilities.find(row => row.compile.outcome === 'error')!;
    const reason = new Error('cancelled negative compile evidence');
    await expect(runCompileCase(capability, AbortSignal.abort(reason))).rejects.toBe(reason);
  });
});
