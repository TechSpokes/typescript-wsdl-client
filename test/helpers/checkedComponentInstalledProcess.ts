import * as packageRoot from '@techspokes/typescript-wsdl-client';
import {exerciseGenerated} from './generatedDirectConsumer.ts';

// @constraints Only the shared test harness type is erased; component calls retain their own protocol and source controls.
await exerciseGenerated(packageRoot.checkedComponentRuntimeV1 as unknown as typeof packageRoot.checkedDirectRuntimeV1, false, true);
