/** Generic RFC2396/2732 syntax for schema anyURI operands, after XLink escaping. */
import {isIP} from "node:net";

/** Regular preimage of the RFC2396/2732 assessor below, before XLink escaping.
 * Every escaped source character contributes one or more percent octets;
 * these are legal in precisely the generic URI-token positions. Raw percent
 * signs still require their two hexadecimal digits. IPv6 has eight 16-bit
 * units, with an embedded IPv4 tail consuming two and :: omitting at least one.
 */
export function schemaUriExpression<Owner>(owner: Owner, c: {step(node: Owner, count?: number): void}): string {
  c.step(owner, 8192);
  const escaped = "[^A-Za-z0-9\\-_.!~*'();/?:@&=+$,#\\[\\]%]";
  const octet = '(%[0-9A-Fa-f]{2}|' + escaped + ')';
  const token = (characters: string) => '([' + characters + ']|' + octet + ')';
  const mark = "A-Za-z0-9\\-_.!~*'()";
  const uric = token(mark + ';/?:@&=+$,\\[\\]');
  const nonSlash = token(mark + ';?:@&=+$,\\[\\]');
  const pchar = token(mark + ':@&=+$,;');
  const first = token(mark + ';@&=+$,');
  const registry = token(mark + '$,:;@&=+');
  const userinfo = token(mark + ';:&=+$,');
  const hex = '[0-9A-Fa-f]{1,4}';
  const ipv4octet = '([0-9]{1,2}|[01][0-9]{2}|2[0-4][0-9]|25[0-5])';
  const ipv4 = ipv4octet + '([.]' + ipv4octet + '){3}';
  const addresses: string[] = [hex + '(:' + hex + '){7}', hex + '(:' + hex + '){5}:' + ipv4];
  for (const tail of [false, true]) for (let left = 0; left <= (tail ? 5 : 7); left++) for (let right = 0; right + left < (tail ? 6 : 8); right++) {
    c.step(owner, 512);
    const before = left ? hex + (left > 1 ? '(:' + hex + '){' + (left - 1) + '}' : '') : '';
    const after = right ? hex + (right > 1 ? '(:' + hex + '){' + (right - 1) + '}' : '') : '';
    addresses.push(before + '::' + after + (tail ? (right ? ':' : '') + ipv4 : ''));
  }
  c.step(owner, addresses.reduce((total, value) => total + value.length, 0) * 4 + 4096);
  const server = '(' + userinfo + '*@)?\\[(' + addresses.join('|') + ')\\](:[0-9]*)?';
  const authority = '(' + registry + '*|' + server + ')';
  const path = pchar + '*(/' + pchar + '*)*';
  const hierarchical = '(//' + authority + '(/' + path + ')?|/' + path + ')';
  const query = '([?]' + uric + '*)?';
  const relative = '(//' + authority + '(/' + path + ')?|/' + path + '|' + first + '+(/' + path + ')?)?';
  const scheme = '[A-Za-z][A-Za-z0-9+.\\-]*:';
  const result = '(' + scheme + '(' + nonSlash + uric + '*|' + hierarchical + query + ')|' + relative + query + ')(#' + uric + '*)?';
  c.step(owner, result.length * 2 + 2); return result;
}

export function schemaUri<Owner>(value: string, owner: Owner, c: {step(node: Owner, count?: number): void}): boolean {
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
