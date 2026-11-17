import {describe, expect, it} from 'vitest';
import {buildUpstreamSoapRuntimeConfig, snapshotUpstreamSecurity} from '../../src/util/upstreamSecurity.js';

describe('shared runtime credential construction', () => {
  it('rejects accessors, proxies and unknown configuration without evaluating user code', () => {
    let reads = 0;
    expect(() => snapshotUpstreamSecurity({get profile() {reads++; return 'basic';}})).toThrow();
    expect(() => snapshotUpstreamSecurity(new Proxy({}, {ownKeys() {reads++; return [];}}))).toThrow();
    expect(() => snapshotUpstreamSecurity({profile: 'basic', rejectUnauthorized: false})).toThrow();
    expect(reads).toBe(0);
  });
  it('keeps metadata and endpoint credential header maps separate and snapshots owned data', () => {
    const source = {profile: 'basic' as const, usernameEnv: 'USER', passwordEnv: 'PASSWORD',
      wsdlHeaderEnv: {'x-metadata': 'METADATA'}, requestHeaderEnv: {'x-endpoint': 'ENDPOINT'}};
    const snapshot = snapshotUpstreamSecurity(source); source.requestHeaderEnv['x-endpoint'] = 'OTHER';
    const built = buildUpstreamSoapRuntimeConfig(snapshot, {USER: 'owned', PASSWORD: 'fixture', METADATA: 'source', ENDPOINT: 'soap'});
    expect(built.options?.wsdl_headers).toEqual({'x-metadata': 'source'});
    expect(built.options?.extraHeaders).toEqual({'x-endpoint': 'soap'});
    const headers = {}; built.security!.addHeaders!(headers);
    expect(headers).toEqual({Authorization: 'Basic b3duZWQ6Zml4dHVyZQ=='});
  });
  it('escapes actor attribute data and refuses missing or injected credential headers', () => {
    const built = buildUpstreamSoapRuntimeConfig({profile: 'ws-security-username-token', usernameEnv: 'U', passwordEnv: 'P',
      wsSecurity: {actor: 'urn:role" injected="value&', hasTimeStamp: false}}, {U: 'owned', P: 'fixture'});
    expect(built.security!.toXML!()).toContain('actor="urn:role&quot; injected=&quot;value&amp;"');
    expect(() => buildUpstreamSoapRuntimeConfig({profile: 'bearer', tokenEnv: 'TOKEN'}, {})).toThrow('Configured upstream credential is required');
    expect(() => buildUpstreamSoapRuntimeConfig({requestHeaderEnv: {Authorization: 'TOKEN'}}, {TOKEN: 'value\r\ninjected: yes'})).toThrow();
  });
});
