/** Invocation-local SOAP preparation ownership without exposing dependency metadata types.
 * @since 1.1.7
 */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectOperationContract} from './directOperation.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import type {SchemaInput} from '../loader/schemaInput.js';
import {prepareComponentSoapWsdl, validateComponentSoapSelection} from './directSoapSource.js';

/** Own closed metadata for one invocation; runtime reconstruction never consumes this object.
 * @since 1.1.7
 * @constraints Every action and selection is checked against authentic native source before reuse.
 */
export class ComponentSoapPreparation {
  readonly #sources = new WeakMap<SchemaInput, Map<string, Promise<unknown>>>();

  /** Prepare one source/service/binding within this invocation.
   * @param contract Fresh native operation identity.
   * @param selection Service/port choice checked before reuse.
   * @param check Cancellation and resource checks owned by this invocation.
   * @returns Resolves after closed metadata preparation; dependency objects remain private.
   * @throws For foreign handles, unsupported selection, cancellation or bootstrap failures.
   */
  async prepare(contract: DirectOperationContract, selection: {service: ExpandedName; port: string}, check: () => void): Promise<void> {
    const {source} = inspectDirectOperation(contract);
    validateComponentSoapSelection(contract, selection, check);
    const key = JSON.stringify([selection.service, selection.port, contract.selector.binding]);
    let entries = this.#sources.get(source);
    if (!entries) {entries = new Map(); this.#sources.set(source, entries);}
    let prepared = entries.get(key);
    if (!prepared) {prepared = prepareComponentSoapWsdl(contract, selection, check); entries.set(key, prepared);}
    await prepared; check();
  }
}
