import {describe, expect, it} from 'vitest';
import {captureHttpResponseHeaders, normalizeHttpResponseHeaders} from '../../src/compiler/httpResponseHeaders.js';
import {parseCheckedComponentChoices as parseCheckedComponentOptions} from '../../src/checkedPipeline.js';

describe('bounded HTTP observation', () => {
  it('normalizes explicit finite names without enabling omission', () => {
    expect(normalizeHttpResponseHeaders(undefined)).toBeUndefined();
    expect(normalizeHttpResponseHeaders([])).toEqual([]);
    expect(normalizeHttpResponseHeaders(['X-Rate', 'x-rate', '__proto__', 'A'])).toEqual(['__proto__', 'a', 'x-rate']);
    expect(normalizeHttpResponseHeaders(['a'.repeat(128)])).toHaveLength(1);
    expect(normalizeHttpResponseHeaders(Array.from({length: 16}, (_, i) => 'x-' + i))).toHaveLength(16);
    expect(parseCheckedComponentOptions({httpResponseHeaders: ['B', 'a', 'A']})).toEqual({httpResponseHeaders: ['a', 'b']});
  });
  it('refuses malformed selections without invoking application accessors', () => {
    const accessor = Object.defineProperty([], '0', {get() {throw new Error('getter');}});
    for (const selection of ['x', null, ['*'], ['bad name'], ['a:b'], ['é'], ['a'.repeat(129)], Array(17).fill('a'), Array(1),
      accessor, new Proxy([], {}), [1], ['x\r\nsecret']]) {
      expect(() => normalizeHttpResponseHeaders(selection)).toThrow(TypeError);
      expect(() => parseCheckedComponentOptions({httpResponseHeaders: selection})).toThrow(TypeError);
    }
  });
  it('copies only selected own data values, keeps coalescing, and freezes invocation ownership', () => {
    const values = ['first', 'second'];
    const source = Object.assign(Object.create({'inherited': 'private'}) as Record<string, unknown>, {
      rate: values, joined: 'a, b', 'set-cookie': 'COOKIE_SENTINEL', authorization: 'AUTH_SENTINEL',
    });
    Object.defineProperty(source, '__proto__', {value: 'safe'});
    Object.defineProperty(source, 'getter', {get() {throw new Error('getter');}});
    const result = captureHttpResponseHeaders(429, source, ['__proto__', 'getter', 'inherited', 'joined', 'missing', 'rate']);
    expect(result).toEqual({status: 429, headers: {['__proto__']: ['safe'], joined: ['a, b'], rate: ['first', 'second']}});
    values[0] = 'changed';
    expect(result.headers.rate).toEqual(['first', 'second']);
    expect(Object.isFrozen(result) && Object.isFrozen(result.headers) && Object.isFrozen(result.headers.rate)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/SENTINEL/);
    expect(captureHttpResponseHeaders(200, source, []).headers).toEqual({});
  });
  it('omits whole invalid fields and preserves exact value and field limits', () => {
    const badArray = Object.defineProperty(['ok'], '1', {get() {throw new Error('getter');}});
    const fields = {exact: ['é'.repeat(512)], over: 'é'.repeat(513), eight: Array<string>(8).fill('ok'),
      nine: Array<string>(9).fill('ok'), mixed: ['ok', 42], control: ['ok', 'bad\n'], del: '\x7f', c1: '\x85',
      malformed: {toString() {throw new Error('coercion');}}, badArray, proxy: new Proxy([], {})};
    const result = captureHttpResponseHeaders(200, fields, Object.keys(fields));
    expect(result.headers).toEqual({exact: ['é'.repeat(512)], eight: Array<string>(8).fill('ok')});
  });
  it('empties the map on aggregate overflow including name bytes', () => {
    const exact = {a: Array<string>(7).fill('x'.repeat(1024)).concat('x'.repeat(1023))};
    expect(captureHttpResponseHeaders(200, exact, ['a']).headers).toEqual(exact);
    expect(captureHttpResponseHeaders(200, {...exact, b: 'x'}, ['a', 'b'])).toEqual({status: 200, headers: {}});
    expect(captureHttpResponseHeaders(200, {a: Array<string>(8).fill('x'.repeat(1024))}, ['a']).headers).toEqual({});
  });
});
