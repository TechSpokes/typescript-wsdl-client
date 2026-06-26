import type {CompilerOptions} from "../../src/config.js";
import type {CompiledCatalog} from "../../src/compiler/schemaCompiler.js";
import type {WsdlErrorContext} from "../../src/util/errors.js";

export type CapabilityStatus = "supported" | "partial" | "diagnostic" | "unsupported" | "research";

export type CapabilityDecision =
  | "support"
  | "partial-support"
  | "diagnostic"
  | "defer"
  | "out-of-scope";

export type FixtureKind =
  | "standards-valid"
  | "interop-profile"
  | "real-world-compatible"
  | "diagnostic-required"
  | "recovery";

export type CompileExpectation =
  | {
    outcome: "success";
    typeNames?: string[];
    aliasNames?: string[];
    operationNames?: string[];
    diagnosticNotes?: string[];
    assert?: (compiled: CompiledCatalog) => void;
  }
  | {
    outcome: "error";
    errorClass?: "WsdlCompilationError";
    messageIncludes?: string[];
    userMessageIncludes?: string[];
    context?: Partial<WsdlErrorContext>;
  }
  | {
    outcome: "research";
    reason: string;
  };

export interface ClientArtifacts {
  clientDir: string;
  compiled: CompiledCatalog;
  files: {
    client: string;
    operations: string;
    types: string;
    utils: string;
  };
  readFile: (file: keyof ClientArtifacts["files"]) => string;
}

export interface ClientExpectation {
  outcome: "success";
  sourceIncludes?: Array<{
    file: keyof ClientArtifacts["files"];
    text: string;
  }>;
  assert?: (artifacts: ClientArtifacts) => void;
}

export interface OpenApiArtifacts {
  compiled: CompiledCatalog;
  doc: any;
  openapiFile: string;
  outDir: string;
}

export interface OpenApiExpectation {
  outcome: "success";
  assert?: (artifacts: OpenApiArtifacts) => void;
}

export interface CapabilityCase {
  id: string;
  title: string;
  status: CapabilityStatus;
  featureTags: string[];
  fixture: string;
  docsAnchor?: string;
  publicContract: string;
  decision: CapabilityDecision;
  decisionReason: string;
  authority: string;
  provenance: string;
  license: string;
  fixtureKind: FixtureKind;
  compilerOptions?: Partial<CompilerOptions>;
  compile: CompileExpectation;
  client?: ClientExpectation;
  openapi?: OpenApiExpectation;
}
