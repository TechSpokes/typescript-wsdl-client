/** Runtime credential references shared by generated applications and checked clients.
 * @since 1.7.0
 * @constraints This data contract has no Node or SOAP implementation type dependencies.
 */
export type UpstreamSecurityConfig = {
  profile?: 'none' | 'basic' | 'bearer' | 'ws-security-username-token' | 'client-ssl' | 'client-ssl-pfx' | 'x509' | 'ntlm' | 'custom';
  usernameEnv?: string; passwordEnv?: string; tokenEnv?: string; domainEnv?: string; workstationEnv?: string;
  keyFileEnv?: string; certFileEnv?: string; caFileEnv?: string; pfxFileEnv?: string; passphraseEnv?: string; endpointEnv?: string;
  wsdlHeaders?: Record<string, string>; wsdlHeaderEnv?: Record<string, string>;
  requestHeaders?: Record<string, string>; requestHeaderEnv?: Record<string, string>;
  wsSecurity?: {passwordType?: 'PasswordText' | 'PasswordDigest'; hasTimeStamp?: boolean; hasTokenCreated?: boolean;
    hasNonce?: boolean; mustUnderstand?: boolean; actor?: string};
};
