/** Additive schema qualification; operation/runtime admission remains a separate owner. */
import type {SchemaInput} from '../loader/schemaInput.js';
import {constructNativeSource, inspectNativeSourceConstruction} from './checkedSourcePreparation.js';
import type {NativeSourceConstruction} from './checkedSourcePreparation.js';
import {checkComponentCorrespondence, inspectComponentCorrespondence} from './componentCorrespondence.js';
import type {ComponentCorrespondenceResult} from './componentCorrespondence.js';

export interface ComponentSourceQualification {
  readonly kind: 'component-source'; readonly construction: NativeSourceConstruction;
  readonly correspondence: ComponentCorrespondenceResult; readonly schemaEligible: boolean; readonly admitted: false;
}
const issued = new WeakMap<ComponentSourceQualification, SchemaInput>();
/** Qualify through fresh native construction and the separate sufficient dated component route. */
export function qualifyComponentSource(input: SchemaInput, options: Parameters<typeof constructNativeSource>[1]):
  Exclude<ReturnType<typeof constructNativeSource>, NativeSourceConstruction> | ComponentSourceQualification {
  return options.budget.guard(() => {
    const construction = constructNativeSource(input, {...options, extensionChains: options.extensionChains ?? true,
      simpleExtensions: options.simpleExtensions ?? options.extensionChains !== false});
    if (construction.kind !== 'constructed-source') return construction;
    const correspondence = checkComponentCorrespondence(input, construction, options);
    if (correspondence.kind === 'resource-limit') return correspondence;
    options.check?.(); options.budget.chargeWork(128);
    const result: ComponentSourceQualification = Object.freeze({kind: 'component-source', construction, correspondence,
      schemaEligible: construction.nativeEstablished && correspondence.kind === 'component-correspondence', admitted: false});
    issued.set(result, input);
    return result;
  });
}
/** Revalidate the exact source/receipt identities before a consumer uses schema eligibility. */
export function inspectComponentSourceQualification(value: ComponentSourceQualification, expectedSource?: SchemaInput): ComponentSourceQualification {
  const source = issued.get(value);
  if (!source || expectedSource !== undefined && source !== expectedSource) throw new TypeError('Fresh component source qualification required');
  inspectNativeSourceConstruction(value.construction, source);
  if (value.correspondence.kind === 'component-correspondence') inspectComponentCorrespondence(value.correspondence, value.construction);
  return value;
}
