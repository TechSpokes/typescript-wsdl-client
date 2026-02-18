/**
 * Tests for WsdlCompilationError structured error class
 */
import { describe, it, expect } from "vitest";
import { WsdlCompilationError } from "../../src/util/errors.js";

describe("WsdlCompilationError", () => {
  it("is an instance of Error", () => {
    const err = new WsdlCompilationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WsdlCompilationError);
  });

  it("has the correct name", () => {
    const err = new WsdlCompilationError("test");
    expect(err.name).toBe("WsdlCompilationError");
  });

  it("preserves message", () => {
    const err = new WsdlCompilationError("Something went wrong");
    expect(err.message).toBe("Something went wrong");
  });

  it("stores context", () => {
    const err = new WsdlCompilationError("fail", {
      element: "Foo",
      namespace: "http://example.com",
      file: "service.wsdl",
      suggestion: "Check imports",
    });
    expect(err.context.element).toBe("Foo");
    expect(err.context.namespace).toBe("http://example.com");
    expect(err.context.file).toBe("service.wsdl");
    expect(err.context.suggestion).toBe("Check imports");
  });

  it("defaults context to empty object", () => {
    const err = new WsdlCompilationError("fail");
    expect(err.context).toEqual({});
  });
});

describe("WsdlCompilationError.toUserMessage", () => {
  it("returns just the message when no context", () => {
    const err = new WsdlCompilationError("Something broke");
    expect(err.toUserMessage()).toBe("Something broke");
  });

  it("includes element when provided", () => {
    const err = new WsdlCompilationError("Unresolved type", { element: "FooBar" });
    expect(err.toUserMessage()).toContain("Element: FooBar");
  });

  it("includes namespace when provided", () => {
    const err = new WsdlCompilationError("Unresolved type", { namespace: "http://ns.example.com" });
    expect(err.toUserMessage()).toContain("Namespace: http://ns.example.com");
  });

  it("includes referencedBy when provided", () => {
    const err = new WsdlCompilationError("Unresolved type", {
      referencedBy: "element 'bar' in type 'Baz'",
    });
    expect(err.toUserMessage()).toContain("Referenced by: element 'bar' in type 'Baz'");
  });

  it("includes file when provided", () => {
    const err = new WsdlCompilationError("Parse error", { file: "/path/to/service.wsdl" });
    expect(err.toUserMessage()).toContain("File: /path/to/service.wsdl");
  });

  it("includes suggestion when provided", () => {
    const err = new WsdlCompilationError("Missing binding", {
      suggestion: "Add a <soap:binding> element",
    });
    expect(err.toUserMessage()).toContain("Suggestion: Add a <soap:binding> element");
  });

  it("formats all context fields in order", () => {
    const err = new WsdlCompilationError("Unresolved type reference: \"Foo\"", {
      element: "Foo",
      namespace: "http://example.com",
      referencedBy: "element 'bar' in type 'Baz'",
      file: "service.wsdl",
      suggestion: "Check that the XSD import is included.",
    });
    const msg = err.toUserMessage();
    const lines = msg.split("\n");
    expect(lines[0]).toBe('Unresolved type reference: "Foo"');
    expect(lines[1]).toBe("  Element: Foo");
    expect(lines[2]).toBe("  Namespace: http://example.com");
    expect(lines[3]).toBe("  Referenced by: element 'bar' in type 'Baz'");
    expect(lines[4]).toBe("  File: service.wsdl");
    expect(lines[5]).toBe("  Suggestion: Check that the XSD import is included.");
    expect(lines).toHaveLength(6);
  });

  it("omits missing context fields", () => {
    const err = new WsdlCompilationError("Error", {
      element: "Foo",
      suggestion: "Try something",
    });
    const msg = err.toUserMessage();
    expect(msg).not.toContain("Namespace:");
    expect(msg).not.toContain("File:");
    expect(msg).not.toContain("Referenced by:");
    expect(msg).toContain("Element: Foo");
    expect(msg).toContain("Suggestion: Try something");
  });
});
