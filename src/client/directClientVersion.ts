/** Generated injection protocol; independent of package, capsule and scalar-policy versions. */
export const DIRECT_CLIENT_RUNTIME_VERSION = 'checked-direct-runtime-v1' as const;
export const DIRECT_CLIENT_RUNTIME_REPAIR = 'Regenerate matched direct client and capsule with the installed runtime.';
/** Component profile never impersonates the supported direct preview protocol. */
export const COMPONENT_CLIENT_RUNTIME_VERSION = 'checked-component-runtime-v2' as const;
/** SOAP 1.2 can return protocol faults without declared application values. */
export const COMPONENT_SOAP12_CLIENT_RUNTIME_VERSION = 'checked-component-soap12-runtime-v1' as const;
/** SOAP 1.1 component clients with value-less protocol faults use their own injection contract. */
export const COMPONENT_SOAP11_CLIENT_RUNTIME_VERSION = 'checked-component-soap11-runtime-v1' as const;
export const COMPONENT_CLIENT_RUNTIME_REPAIR = 'Regenerate matched component client and source artifacts with the installed runtime.';
