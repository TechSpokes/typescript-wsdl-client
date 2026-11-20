import path from 'node:path';
import {generateCheckedClient, generateCheckedOpenAPI, generateCheckedGateway, scaffoldCheckedApp,
  type CheckedAppOptions, type CheckedClientOptions, type CheckedClientResult} from '@techspokes/typescript-wsdl-client';

const options: CheckedClientOptions = {wsdl: process.argv[2]!, clientOutDir: process.argv[3]!};
const result: CheckedClientResult = await generateCheckedClient(options);
const appDir = process.argv[4];
if (appDir) {
  const app: CheckedAppOptions = {...options, appDir, openapiFile: path.join(appDir, 'openapi.json'),
    gatewayDir: path.join(appDir, 'gateway'), serviceSlug: 'forecast', versionSlug: 'v1',
    test: {testDir: path.join(appDir, 'test')}};
  const openapi = await generateCheckedOpenAPI(app);
  const gateway = await generateCheckedGateway(app);
  const scaffold = await scaffoldCheckedApp(app);
  console.log(JSON.stringify({openapi, gateway, scaffold, client: result}));
} else {
  console.log(JSON.stringify(result));
}
