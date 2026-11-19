import {generateCheckedClient, type CheckedClientOptions, type CheckedClientResult} from '@techspokes/typescript-wsdl-client';

const options: CheckedClientOptions = {wsdl: process.argv[2]!, clientOutDir: process.argv[3]!};
const result: CheckedClientResult = await generateCheckedClient(options);
console.log(JSON.stringify(result));
