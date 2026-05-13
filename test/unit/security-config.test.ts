import {describe, expect, it} from "vitest";
import {
  buildSecurity,
  parseSecurityConfig,
  SecurityConfigError,
} from "../../src";

describe("parseSecurityConfig", () => {
  it("parses the new gateway and upstream shape", () => {
    const cfg = parseSecurityConfig({
      gateway: {
        global: {
          scheme: "bearer",
          bearer: {bearerFormat: "JWT"},
          headers: [{name: "X-Correlation-Id"}],
        },
        operations: {
          Ping: {scheme: "none"},
        },
      },
      upstream: {
        profile: "ws-security-username-token",
        usernameEnv: "SOAP_USERNAME",
        passwordEnv: "SOAP_PASSWORD",
      },
    });

    expect(cfg.gateway?.global?.scheme).toBe("bearer");
    expect(cfg.gateway?.operations?.Ping.scheme).toBe("none");
    expect(cfg.upstream?.profile).toBe("ws-security-username-token");
  });

  it("accepts the legacy OpenAPI-only security shape", () => {
    const cfg = parseSecurityConfig({
      global: {
        scheme: "apiKey",
        apiKey: {in: "header", name: "X-API-Key"},
      },
      overrides: {
        GetWeather: {scheme: "basic"},
      },
    });

    expect(cfg.gateway?.global?.scheme).toBe("apiKey");
    expect(cfg.gateway?.overrides?.GetWeather.scheme).toBe("basic");
  });

  it("rejects unsupported gateway and upstream schemes", () => {
    expect(() => parseSecurityConfig({gateway: {global: {scheme: "digest"}}}))
      .toThrow(SecurityConfigError);
    expect(() => parseSecurityConfig({upstream: {profile: "kerberos"}}))
      .toThrow(SecurityConfigError);
  });
});

describe("buildSecurity", () => {
  it("builds top-level and operation OpenAPI security", () => {
    const built = buildSecurity(parseSecurityConfig({
      gateway: {
        global: {
          scheme: "bearer",
          bearer: {bearerFormat: "JWT"},
          headers: [{name: "X-Tenant-Id", required: true}],
        },
        operations: {
          PublicPing: {scheme: "none"},
          ApiKeyOnly: {scheme: "apiKey"},
        },
      },
    }));

    expect(built.globalSecurity).toEqual([{defaultAuth: []}]);
    expect(built.securitySchemes?.defaultAuth).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(built.securitySchemes?.defaultAuth_apiKey).toEqual({
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
    });
    expect(built.opSecurity.PublicPing).toEqual([{}]);
    expect(built.opSecurity.ApiKeyOnly).toEqual([{defaultAuth_apiKey: []}]);
    expect(built.headerParameters.X_Tenant_Id.required).toBe(true);
  });

  it("normalizes header parameter component names without edge-trim regexes", () => {
    const built = buildSecurity(parseSecurityConfig({
      gateway: {
        global: {
          headers: [
            {name: "---X-Correlation-Id---"},
            {name: "___"},
          ],
        },
      },
    }));

    expect(Object.keys(built.headerParameters)).toEqual(["X_Correlation_Id", "X_Header"]);
  });

  it("builds OpenAPI 3.1 mutual TLS and OpenID Connect schemes", () => {
    const mtls = buildSecurity(parseSecurityConfig({
      gateway: {
        global: {
          scheme: "mutualTLS",
          mutualTLS: {description: "Client certificate required"},
        },
      },
    }));
    expect(mtls.securitySchemes?.defaultAuth).toEqual({
      type: "mutualTLS",
      description: "Client certificate required",
    });

    const oidc = buildSecurity(parseSecurityConfig({
      gateway: {
        global: {
          scheme: "openIdConnect",
          openIdConnect: {openIdConnectUrl: "https://issuer.example/.well-known/openid-configuration"},
        },
      },
    }));
    expect(oidc.securitySchemes?.defaultAuth.openIdConnectUrl).toContain("issuer.example");
  });
});
