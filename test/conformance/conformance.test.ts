import {
  registerAppCases,
  registerClientCases,
  registerCompileCases,
  registerContractCases,
  registerGatewayCases,
  registerGeneratedTestCases,
  registerOpenApiCases,
} from "./suite.js";

registerContractCases();
registerCompileCases();
registerClientCases();
registerOpenApiCases();
registerGatewayCases();
registerGeneratedTestCases();
registerAppCases();
