/** Private alias capacity builder; its metrics come from the formed scalar owner. */
export type EndpointCapacityExpression = Readonly<{kind: 'integer'; value: string}>
  | Readonly<{kind: 'add' | 'multiply'; children: readonly EndpointCapacityExpression[]}>
  | Readonly<{kind: 'power'; base: EndpointCapacityExpression; exponent: string}>;
export type EndpointCapacityMetrics = Readonly<{family: string; roles: number; formulaLeaves: number; rawMaskStates: number;
  constantCount: number; constantTextUnits: number; inputMagnitude: bigint; magnitudeDigits: number}>;
export function endpointCapacity(metrics: EndpointCapacityMetrics, step: (count: number) => void) {
  // Reserve the entire fixed AST topology, rest arrays, closures and metadata before construction.
  step(1024 + metrics.magnitudeDigits * 2);
  const count = (n: number): number => {
    if (!Number.isSafeInteger(n) || n < 0) {step(Number.MAX_SAFE_INTEGER); throw new Error('Unreachable exhausted capacity count');}
    return n;
  };
  const integer = (value: number | bigint): EndpointCapacityExpression => {
    const digits = typeof value === 'number' ? 24 : metrics.magnitudeDigits + 64;
    step(digits + 8); const text = value.toString(); return {kind: 'integer', value: text};
  };
  const combine = (kind: 'add' | 'multiply', children: readonly EndpointCapacityExpression[]): EndpointCapacityExpression => {
    step(children.length + 4); return {kind, children};
  };
  const power = (base: EndpointCapacityExpression, exponent: number): EndpointCapacityExpression => {
    count(exponent); step(32); return {kind: 'power', base, exponent: String(exponent)};
  };
  const add = (...parts: EndpointCapacityExpression[]) => combine('add', parts);
  const multiply = (...parts: EndpointCapacityExpression[]) => combine('multiply', parts);
  const nStates = count(1 + metrics.rawMaskStates + 16 * metrics.constantTextUnits + 512);
  const equations = count(16 * metrics.formulaLeaves + 4 * metrics.roles + 4);
  const tracks = count(7 * metrics.roles + 6 * metrics.constantCount + equations + 1);
  step((metrics.magnitudeDigits + 64) ** 2 + 16);
  const carry = BigInt(tracks + 1) * 1_000_000_000_000_000n * (1n + metrics.inputMagnitude);
  const fieldStates = power(integer(2), count(64 * (nStates + 1)));
  const jointStates = multiply(add(power(multiply(integer(2), fieldStates), tracks), power(add(fieldStates, integer(1)), tracks)),
    power(integer(2n * carry + 1n), equations), power(integer(2), tracks));
  const encodedTuple = multiply(integer(count(2 * metrics.roles)), add(multiply(integer(8), add(jointStates, integer(1))), integer(count(2 * nStates + 64))));
  step(16);
  return {kind: 'finite-capacity' as const, family: metrics.family, roles: metrics.roles, formulaLeaves: metrics.formulaLeaves,
    maskStates: metrics.rawMaskStates, constants: metrics.constantCount, equations, tracks, fieldStates, jointStates, encodedTuple};
}
