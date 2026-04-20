
  /**
   * Streaming transport for operations flagged with a stream configuration.
   *
   * node-soap buffers the full response before invoking the operation callback
   * (verified empirically in ADR-002 / phase-0 research), so this method
   * bypasses node-soap and POSTs a hand-built SOAP envelope directly, then
   * pipes the response body through the SAX-driven record parser.
   */
  protected async callStream<RequestType, RecordType, HeadersType>(
    args: RequestType,
    operation: string,
    requestType: string | undefined,
    recordTypeName: string,
    inputElementLocal: string,
    inputElementNs: string,
    soapAction: string,
    recordPath: string[]
  ): Promise<StreamOperationResponse<RecordType, HeadersType>> {
    const client = await this.soapClient();
    const endpoint = this.resolveStreamEndpoint(client);
    const envelope = this.buildSoapEnvelope(args, operation, requestType, inputElementLocal, inputElementNs);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        "soapaction": '"' + soapAction + '"',
      },
      body: envelope,
    });
    if (!res.ok) {
      throw new Error(
        operation + " stream request failed: " + res.status + " " + res.statusText
      );
    }
    if (!res.body) {
      throw new Error(operation + " stream request returned an empty response body");
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => { headers[key] = value; });
    const spec: RecordParseSpec = {
      recordPath,
      recordTypeName,
      attributesKey: this.attributesKeyOut,
      childType: this.dataTypes?.ChildrenTypes,
    };
    const records = parseRecords<RecordType>(
      this.webStreamToAsyncIterable(res.body),
      spec
    );
    return {
      records,
      headers: headers as unknown as HeadersType,
      requestRaw: envelope,
    };
  }

  /**
   * Walk the node-soap WSDL descriptor to locate the first service port's
   * SOAP address. Falls back to the \`source\` URL when the descriptor is
   * unavailable (e.g., \`source\` was given as a direct endpoint URL).
   */
  protected resolveStreamEndpoint(client: soap.Client): string {
    const services = (client as any)?.wsdl?.definitions?.services ?? {};
    for (const svc of Object.values(services)) {
      const ports = (svc as any)?.ports ?? {};
      for (const port of Object.values(ports)) {
        const location = (port as any)?.location;
        if (typeof location === "string" && location) return location;
      }
    }
    return this.source;
  }

  /**
   * Build a SOAP 1.1 envelope around the operation's input element. Uses the
   * existing attributes / children metadata so attribute bags render as XML
   * attributes and child properties render as nested elements.
   */
  protected buildSoapEnvelope(
    args: unknown,
    operation: string,
    requestType: string | undefined,
    inputElementLocal: string,
    inputElementNs: string
  ): string {
    const body = this.toXmlElement(args, requestType, inputElementLocal, inputElementNs);
    return '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body>' + body + '</soap:Body>' +
      '</soap:Envelope>';
  }

  /**
   * Serialize a value as a single XML element. The element namespace is only
   * emitted when \`namespace\` is provided (i.e., the envelope's top-level body
   * element). Nested elements inherit the namespace via XML scoping.
   */
  protected toXmlElement(
    value: unknown,
    typeName: string | undefined,
    elementName: string,
    namespace?: string
  ): string {
    const nsAttr = namespace ? ' xmlns="' + this.escapeXml(namespace) + '"' : "";
    if (value === null || value === undefined) {
      return '<' + elementName + nsAttr +
        ' xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>';
    }
    if (typeof value !== "object") {
      return '<' + elementName + nsAttr + '>' + this.escapeXml(String(value)) + '</' + elementName + '>';
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.toXmlElement(v, typeName, elementName, namespace)).join("");
    }
    const obj = value as Record<string, unknown>;
    const attributesList = (typeName && this.dataTypes?.Attributes?.[typeName]) || [];
    const childrenTypes = (typeName && this.dataTypes?.ChildrenTypes?.[typeName]) || {};
    const attrPairs: Array<[string, string]> = [];
    const bagIn = (obj as any)[this.attributesKeyIn] ?? (obj as any)["attributes"];
    if (bagIn && typeof bagIn === "object") {
      for (const [k, v] of Object.entries(bagIn)) attrPairs.push([k, this.normalizeAttr(v)]);
    }
    const childParts: string[] = [];
    let textContent: string | undefined;
    if ("$value" in obj) textContent = String(obj.$value ?? "");
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$value" || k === this.attributesKeyIn || k === "attributes") continue;
      if ((attributesList as readonly string[]).includes(k)) {
        attrPairs.push([k, this.normalizeAttr(v)]);
        continue;
      }
      const childTypeRaw = (childrenTypes as Record<string, string>)[k];
      const childType = childTypeRaw?.endsWith("[]") ? childTypeRaw.slice(0, -2) : childTypeRaw;
      if (Array.isArray(v)) {
        for (const item of v) childParts.push(this.toXmlElement(item, childType, k));
      } else {
        childParts.push(this.toXmlElement(v, childType, k));
      }
    }
    const attrStr = attrPairs.map(([k, val]) => ' ' + k + '="' + this.escapeXml(val) + '"').join("");
    if (childParts.length === 0 && textContent === undefined) {
      return '<' + elementName + nsAttr + attrStr + '/>';
    }
    const inner = childParts.join("") + (textContent !== undefined ? this.escapeXml(textContent) : "");
    return '<' + elementName + nsAttr + attrStr + '>' + inner + '</' + elementName + '>';
  }

  protected normalizeAttr(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    return String(v);
  }

  protected escapeXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Iterate an uploaded web ReadableStream as Uint8Array chunks. Node 20+
   * ReadableStream implements Symbol.asyncIterator natively; this helper
   * normalizes the types so TypeScript can drive it through \`for await\`.
   */
  protected async *webStreamToAsyncIterable(
    body: ReadableStream<Uint8Array>
  ): AsyncIterable<Uint8Array> {
    const reader = body.getReader();
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  }
