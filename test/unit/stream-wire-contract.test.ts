import {describe, expect, it} from "vitest";
import {parseRecords} from "../../src/runtime/streamXml.js";

async function collect(source: AsyncIterable<unknown>): Promise<unknown[]> {
  const result: unknown[] = [];
  for await (const record of source) result.push(record);
  return result;
}

describe("stream XML wire contract", () => {
  it("uses explicit repetition metadata while preserving lexical inline-list nodes", async () => {
    async function* source() { yield '<Reply><Record><Inline>1 2</Inline><RepeatedInline>3 4</RepeatedInline></Record></Reply>'; }
    const spec = {recordPath: ["Reply", "Record"], recordTypeName: "Record", childType: {Record: {Inline: "number[]", RepeatedInline: "number[]"}}, repeatedElements: {Record: ["RepeatedInline"]}};
    expect(await collect(parseRecords(source(), spec))).toEqual([{Inline: "1 2", RepeatedInline: ["3 4"]}]);
  });
  it("matches local element names and preserves UTF-8 across byte boundaries", async () => {
    const bytes = new TextEncoder().encode('<p:Reply xmlns:p="urn:p"><p:Record Code="a"><p:Name>café 🏠</p:Name></p:Record></p:Reply>');
    async function* source() { for (const byte of bytes) yield Uint8Array.of(byte); }
    expect(await collect(parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "Record"})))
      .toEqual([{$attributes: {Code: "a"}, Name: "café 🏠"}]);
  });

  it.each(["true", "1"])("accepts namespace-qualified nil=%s", async nil => {
    async function* source() { yield '<Reply xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Record><Value i:nil="' + nil + '"/></Record></Reply>'; }
    expect(await collect(parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "Record"})))
      .toEqual([{Value: null}]);
  });

  it("rejects a SOAP Fault instead of silently yielding no records", async () => {
    async function* source() { yield '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>denied</faultstring></s:Fault></s:Body></s:Envelope>'; }
    await expect(collect(parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "Record"})))
      .rejects.toThrow(/SOAP Fault/);
  });

  it("keeps application Fault elements and foreign nil attributes as application data", async () => {
    async function* source() { yield '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Reply xmlns="urn:application" xmlns:xsi="urn:foreign"><Record><Fault>data</Fault><Value xsi:nil="true">text</Value></Record></Reply></s:Body></s:Envelope>'; }
    expect(await collect(parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "Record"})))
      .toEqual([{Fault: "data", Value: {$attributes: {"xsi:nil": "true"}, $value: "text"}}]);
  });

  it("rejects SOAP 1.2 faults after already emitted records", async () => {
    async function* source() {
      yield '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><Reply><Record>first</Record></Reply>';
      yield '<s:Fault><s:Reason><s:Text>failed</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>';
    }
    const iterator = parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "string"})[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({done: false, value: "first"});
    await expect(iterator.next()).rejects.toThrow(/SOAP Fault/);
  });

  it("returns the upstream iterator when the consumer stops after a record", async () => {
    let closed = false;
    async function* source() {
      try { yield '<Reply><Record>first</Record>'; yield '<Record>second</Record></Reply>'; }
      finally { closed = true; }
    }
    for await (const value of parseRecords(source(), {recordPath: ["Reply", "Record"], recordTypeName: "string"})) {
      expect(value).toBe("first");
      break;
    }
    expect(closed).toBe(true);
  });
});
