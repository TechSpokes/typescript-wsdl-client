/** Shared runtime credential builders for legacy scaffolds and checked buffered execution.
 * @since Unreleased
 * @constraints Configuration contains environment names, not artifact-embedded credentials.
 */
import fs from 'node:fs';
import {types} from 'node:util';
import * as soapRuntime from 'soap/lib/security/index.js';
import type {IOptions, ISecurity} from 'soap/lib/types.js';
import type {ConnectionOptions} from 'node:tls';
import type {UpstreamSecurityConfig} from './upstreamSecurityTypes.js';
export type {UpstreamSecurityConfig} from './upstreamSecurityTypes.js';

export interface SoapRuntimeConfig {
  readonly profile: NonNullable<UpstreamSecurityConfig['profile']>;
  readonly options?: IOptions & {extraHeaders?: Record<string, string>};
  readonly security?: ISecurity;
  readonly tls?: Pick<ConnectionOptions, 'key' | 'cert' | 'ca' | 'pfx' | 'passphrase'>;
}

const fields = ['profile', 'usernameEnv', 'passwordEnv', 'tokenEnv', 'domainEnv', 'workstationEnv', 'keyFileEnv', 'certFileEnv',
  'caFileEnv', 'pfxFileEnv', 'passphraseEnv', 'endpointEnv', 'wsdlHeaders', 'wsdlHeaderEnv', 'requestHeaders', 'requestHeaderEnv', 'wsSecurity'];
function dataRecord(value: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null))
    throw new TypeError('Runtime security configuration must be own data');
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || allowed && !allowed.includes(key) || !descriptor || !('value' in descriptor))
      throw new TypeError('Unknown or non-data runtime security configuration');
    result[key] = descriptor.value;
  }
  return result;
}

/** Validate configuration without reading environment variables or credential files.
 * @returns An owned data-only configuration using the established security schema.
 * @throws TypeError For unknown fields, accessors, proxies or invalid values.
 */
export function snapshotUpstreamSecurity(value: unknown): UpstreamSecurityConfig {
  const source = dataRecord(value, fields), result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(source)) {
    if (item === undefined) continue;
    if (key === 'wsSecurity') {
      const options = dataRecord(item, ['passwordType', 'hasTimeStamp', 'hasTokenCreated', 'hasNonce', 'mustUnderstand', 'actor']);
      for (const [name, entry] of Object.entries(options)) {
        if (entry === undefined) continue;
        if (name === 'passwordType' ? entry !== 'PasswordText' && entry !== 'PasswordDigest' : name === 'actor' ? typeof entry !== 'string' : typeof entry !== 'boolean')
          throw new TypeError('Invalid WS-Security option');
      }
      result[key] = options;
    } else if (['wsdlHeaders', 'wsdlHeaderEnv', 'requestHeaders', 'requestHeaderEnv'].includes(key)) {
      const headers = dataRecord(item);
      for (const [name, entry] of Object.entries(headers)) if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
        || typeof entry !== 'string' || /[\r\n\0]/.test(entry)) throw new TypeError('Invalid runtime HTTP header');
      result[key] = headers;
    } else {
      if (typeof item !== 'string') throw new TypeError('Runtime security environment names must be strings');
      result[key] = item;
    }
  }
  if (result.profile !== undefined && !['none', 'basic', 'bearer', 'ws-security-username-token', 'client-ssl', 'client-ssl-pfx', 'x509', 'ntlm', 'custom'].includes(result.profile as string))
    throw new TypeError('Unknown upstream security profile');
  return result as UpstreamSecurityConfig;
}

/** Build established node-soap security from runtime environment references.
 * @param config Existing upstream configuration; metadata and endpoint header maps stay separate.
 * @param environment Invocation environment; values never enter generated artifacts.
 * @returns Known dependency security plus vetted TLS material for an owned checked agent.
 * @throws For invalid configuration, missing credentials or unreadable credential files.
 * @sideEffects Reads explicitly configured environment variables and credential files.
 */
export function buildUpstreamSoapRuntimeConfig(config: UpstreamSecurityConfig, environment: Readonly<NodeJS.ProcessEnv> = process.env): SoapRuntimeConfig {
  const upstream = snapshotUpstreamSecurity(config), options: IOptions & {extraHeaders?: Record<string, string>} = {};
  const env = (name: string | undefined) => name === undefined ? undefined : environment[name];
  const required = (name: string | undefined): string => {
    const value = env(name); if (!name || !value) throw new Error('Configured upstream credential is required'); return value;
  };
  const file = (name: string | undefined) => fs.readFileSync(required(name));
  const headers = (staticValues?: Record<string, string>, variables?: Record<string, string>) => {
    const values: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, staticValues);
    for (const [name, variable] of Object.entries(variables ?? {})) {
      const value = environment[variable];
      if (value !== undefined) {
        if (/[\r\n\0]/.test(value)) throw new Error('Invalid runtime HTTP credential header');
        values[name] = value;
      }
    }
    return values;
  };
  const wsdlHeaders = headers(upstream.wsdlHeaders, upstream.wsdlHeaderEnv);
  if (Object.keys(wsdlHeaders).length) options.wsdl_headers = wsdlHeaders;
  const requestHeaders = headers(upstream.requestHeaders, upstream.requestHeaderEnv);
  if (Object.keys(requestHeaders).length) options.extraHeaders = requestHeaders;
  if (upstream.endpointEnv && env(upstream.endpointEnv)) options.endpoint = env(upstream.endpointEnv);
  const profile = upstream.profile ?? 'none';
  let security: ISecurity | undefined, tls: SoapRuntimeConfig['tls'];
  switch (profile) {
    case 'none': break;
    case 'basic': security = new soapRuntime.BasicAuthSecurity(required(upstream.usernameEnv), required(upstream.passwordEnv)); break;
    case 'bearer': security = new soapRuntime.BearerSecurity(required(upstream.tokenEnv)); break;
    case 'ws-security-username-token': {
      const actor = upstream.wsSecurity?.actor?.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      security = new soapRuntime.WSSecurity(required(upstream.usernameEnv), required(upstream.passwordEnv),
        {...upstream.wsSecurity, ...(actor === undefined ? {} : {actor})}); break;
    }
    case 'ntlm': security = new soapRuntime.NTLMSecurity({username: required(upstream.usernameEnv), password: required(upstream.passwordEnv),
      domain: env(upstream.domainEnv) ?? '', workstation: env(upstream.workstationEnv) ?? ''}); break;
    case 'client-ssl': {
      const key = file(upstream.keyFileEnv), cert = file(upstream.certFileEnv), ca = upstream.caFileEnv ? file(upstream.caFileEnv) : undefined;
      tls = {key, cert, ...(ca ? {ca} : {})}; security = new soapRuntime.ClientSSLSecurity(key, cert, ca); break;
    }
    case 'client-ssl-pfx': {
      const pfx = file(upstream.pfxFileEnv), passphrase = env(upstream.passphraseEnv);
      tls = {pfx, ...(passphrase === undefined ? {} : {passphrase})}; security = new soapRuntime.ClientSSLSecurityPFX(pfx, passphrase); break;
    }
    case 'x509': security = new soapRuntime.WSSecurityCert(file(upstream.keyFileEnv), file(upstream.certFileEnv), env(upstream.passphraseEnv) ?? ''); break;
    case 'custom': throw new Error('upstream.profile=custom requires a consumer security implementation');
  }
  return {profile, ...(Object.keys(options).length ? {options} : {}), ...(security ? {security} : {}), ...(tls ? {tls} : {})};
}
