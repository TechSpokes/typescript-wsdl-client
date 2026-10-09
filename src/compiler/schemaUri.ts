/** Generic RFC2396/2732 syntax for schema anyURI operands, after XLink escaping. */
import {isIP} from "node:net";
import type {GraphNode} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";

export function schemaUri(value: string, owner: GraphNode, c: AssessmentContext): boolean {
  c.step(owner, value.length * 12 + 1);
  let escaped = "";
  for (const character of value) {
    c.step(owner);
    if (/^[A-Za-z0-9\-_.!~*'();/?:@&=+$,#[\]%]$/.test(character)) escaped += character;
    else for (const byte of Buffer.from(character, "utf8")) escaped += `%${byte.toString(16).padStart(2, "0")}`;
  }
  if (/%(?![0-9A-Fa-f]{2})/.test(escaped)) return false;
  const uric = /^(?:[A-Za-z0-9\-_.!~*'();/?:@&=+$,[\]]|%[0-9A-Fa-f]{2})*$/;
  const hash = escaped.indexOf("#"), fragment = hash < 0 ? "" : escaped.slice(hash + 1), resource = hash < 0 ? escaped : escaped.slice(0, hash);
  if (!uric.test(fragment)) return false;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(resource);
  let rest = scheme ? resource.slice(scheme[0].length) : resource;
  if (scheme && !rest) return false;
  // Opaque absolute identifiers use uric, beginning with a non-slash.
  if (scheme && rest[0] !== "/") return uric.test(rest);
  const question = rest.indexOf("?"), query = question < 0 ? "" : rest.slice(question + 1);
  rest = question < 0 ? rest : rest.slice(0, question);
  if (!uric.test(query)) return false;
  if (rest.startsWith("//")) {
    const slash = rest.indexOf("/", 2), authority = rest.slice(2, slash < 0 ? undefined : slash);
    rest = slash < 0 ? "" : rest.slice(slash);
    // RFC2396 registry authorities are legal, even where a named protocol
    // would demand a numeric port. Brackets denote the RFC2732 server form.
    if (/[\[\]]/.test(authority)) {
      const server = /^(?:((?:[A-Za-z0-9\-_.!~*'();:&=+$,]|%[0-9A-Fa-f]{2})*)@)?\[([^\]]+)\](?::[0-9]*)?$/.exec(authority);
      if (!server || server[2].includes("%")) return false;
      let address = server[2];
      if (address.includes(".")) {
        const colon = address.lastIndexOf(":"), octets = address.slice(colon + 1).split(".");
        // RFC2732 imports RFC2373: embedded IPv4 octets are one to three
        // decimal digits, including leading zeros (not modern URL grammar).
        if (octets.length !== 4 || octets.some(octet => !/^[0-9]{1,3}$/.test(octet) || Number(octet) > 255)) return false;
        address = address.slice(0, colon + 1) + octets.map(octet => String(Number(octet))).join(".");
      }
      if (isIP(address) !== 6) return false;
    } else if (!/^(?:[A-Za-z0-9\-_.!~*'()$,:;@&=+]|%[0-9A-Fa-f]{2})*$/.test(authority)) return false;
  } else if (rest && rest[0] !== "/") {
    const slash = rest.indexOf("/"), segment = slash < 0 ? rest : rest.slice(0, slash);
    if (!/^(?:[A-Za-z0-9\-_.!~*'();@&=+$,]|%[0-9A-Fa-f]{2})+$/.test(segment)) return false;
  }
  return /^(?:[A-Za-z0-9\-_.!~*'():@&=+$,;/]|%[0-9A-Fa-f]{2})*$/.test(rest);
}
