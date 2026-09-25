import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";

/**
 * Verifies generated clients against real singleton and repeated SOAP responses.
 * @param {{client: object, createGateway?: Function}} options Generated consumer artifacts only.
 * @returns {Promise<void>} Resolves after transport, DTO, and optional gateway assertions pass.
 */
export async function verifyOccurrenceTransport({client, createGateway}) {
  let count = 1;
  let requestXml = "";
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requestXml = Buffer.concat(chunks).toString("utf8");
    const addresses = Array.from({length: count}, (_, index) =>
      `<tns:address><tns:street>Street ${index}</tns:street></tns:address>`).join("");
    const optional = count === 2
      ? "<tns:optionalAddresses><tns:address><tns:street>Optional</tns:street></tns:address></tns:optionalAddresses>"
      : "";
    const labels = count === 2 ? "<tns:label>first</tns:label><tns:label>second</tns:label>" : "<tns:label>only</tns:label>";
    response.setHeader("Content-Type", "text/xml; charset=utf-8");
    response.end(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="urn:conformance:sequence-occurrence"><soap:Body><tns:SubmitOccurrenceResponse><tns:addresses>${addresses}</tns:addresses>${optional}${labels}</tns:SubmitOccurrenceResponse></soap:Body></soap:Envelope>`);
  });
  server.requestTimeout = 5_000;
  server.listen(0, "127.0.0.1");
  let gateway;
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    (await client.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}`);
    gateway = await createGateway?.(client);
    for (count of [1, 2]) {
      const payload = count === 1 ? {requestId: "omitted"}
        : {requestId: "repeated", bounded: ["a", "b"], unbounded: ["c", "d"]};
      const expected = {
        addresses: {address: Array.from({length: count}, (_, index) => ({street: `Street ${index}`}))},
        ...(count === 2 ? {optionalAddresses: {address: [{street: "Optional"}]}} : {}),
        label: count === 1 ? ["only"] : ["first", "second"],
      };
      const result = await bounded(client.SubmitOccurrence(payload));
      assert.deepEqual(result.response, expected, `SOAP ${count}-item DTO must match its array contract`);
      assertRequest(requestXml, count);
      if (gateway) {
        const response = await bounded(gateway.app.inject({method: "POST", url: "/submit-occurrence", payload}));
        assert.equal(response.statusCode, 200, response.body);
        const data = gateway.flatten ? {
          ...expected,
          addresses: expected.addresses.address,
          ...(count === 2 ? {optionalAddresses: expected.optionalAddresses.address} : {}),
        } : expected;
        assert.deepEqual(response.json(), {status: "SUCCESS", message: null, data, error: null});
        assertRequest(requestXml, count);
      }
    }
  } finally {
    try {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally {
      await gateway?.app.close();
    }
  }
}

async function bounded(operation) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("SOAP transport assertion exceeded 10 seconds")), 10_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

function assertRequest(xml, count) {
  for (const [name, values] of [["bounded", ["a", "b"]], ["unbounded", ["c", "d"]]]) {
    const matches = [...xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${name}>([^<]*)</(?:[\\w.-]+:)?${name}>`, "g"))];
    assert.deepEqual(matches.map(match => match[1]), count === 1 ? [] : values, `${name} SOAP request elements`);
  }
}
