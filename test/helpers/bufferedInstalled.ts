import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runGenerationPipeline} from '../../src/index.js';

/** Prepare generated service clients and owned credentials for the existing single installed consumer. */
export async function prepareBufferedInstalled(root: string, consumer: string, signal?: AbortSignal): Promise<void> {
  const namespace = 'urn:conformance:headers';
  const original = await readFile(path.join(root, 'test/conformance/fixtures/soap/headers/declared-literal.wsdl'), 'utf8');
  const messages = '<w:message name="PlainInput"><w:part name="body" element="t:Request"/></w:message><w:message name="PlainOutput"><w:part name="body" element="t:Response"/></w:message>';
  const abstract = '<w:operation name="APlain"><w:input message="t:PlainInput"/><w:output message="t:PlainOutput"/></w:operation>';
  const concrete = (prefix: string) => `<w:operation name="APlain"><${prefix}:operation soapAction="urn:plain"/><w:input><${prefix}:body use="literal"/></w:input><w:output><${prefix}:body use="literal"/></w:output></w:operation>`;
  const source = path.join(consumer, 'authorized/buffered.wsdl');
  await writeFile(source, original.replace('<w:portType', messages + '<w:portType').replace('</w:portType>', abstract + '</w:portType>')
    .replace('</w:binding>', concrete('s') + '</w:binding>').replace(/<\/w:binding>\r?\n  <w:service/, concrete('s12') + '</w:binding>\n  <w:service'));
  for (const version of ['11', '12']) {
    signal?.throwIfAborted();
    const project = path.join(consumer, 'buffered' + version);
    await runGenerationPipeline({wsdl: source, model: 'checked-components-v1', checkedComponents: {
      selectors: ['APlain', 'Invoke'].map(operation => ({operation, portType: {namespace, local: 'HeaderPortType'}, binding: {namespace, local: 'Soap' + version}})),
      service: {namespace, local: 'HeaderService'}, port: 'Port' + version, fileRoots: [consumer], sourceResources: [], sourceOrigins: [], ...(signal ? {signal} : {}),
    }, clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
    gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'buffered'}});
  }
  const graph = path.join(consumer, 'authorized/source-graph'); await mkdir(graph);
  const sourceNamespace = 'urn:conformance:import-relative-types', serviceNamespace = sourceNamespace + ':service';
  const wsdl = (await readFile(path.join(root, 'test/conformance/fixtures/xsd/imports/import-relative-types.wsdl'), 'utf8'))
    .replace(/^<\?xml[^?]*\?>\s*/, '').replace('name="payload"', 'name="constructor"')
    .replaceAll('<wsdl:operation name="SubmitImported"', '<wsdl:operation name="constructor"')
    .replaceAll('type="types:', 'type="constructor:').replace('xmlns:types=', 'xmlns:constructor=');
  const service = /<wsdl:service[\s\S]*?<\/wsdl:service>/.exec(wsdl)![0].replace('name="ImportService"', 'name="__proto__"').replace('name="ImportPort"', 'name="toString"');
  const main = wsdl.replace(/<wsdl:service[\s\S]*?<\/wsdl:service>/, '')
    .replace('<wsdl:types>', `<wsdl:import namespace="${serviceNamespace}" location="service.wsdl"/><wsdl:documentation>café</wsdl:documentation><wsdl:types>`);
  const companion = `<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="${sourceNamespace}" targetNamespace="${serviceNamespace}"><wsdl:import namespace="${sourceNamespace}" location="source.wsdl"/>${service}</wsdl:definitions>`;
  const schema = (await readFile(path.join(root, 'test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd'), 'utf8'))
    .replace(/^<\?xml[^?]*\?>\s*/, '').replace('<xs:complexType name="ImportedPayload">', '<xs:include schemaLocation="b.xsd"/><xs:complexType name="ImportedPayload">').replace('name="name"', 'name="nomÉ"');
  const graphSource = path.join(graph, 'source.wsdl'), schemaFile = path.join(graph, 'import-relative-types-types.xsd');
  await writeFile(graphSource, Buffer.from(main, 'latin1')); await writeFile(schemaFile, Buffer.from(schema, 'utf16le'));
  await writeFile(path.join(graph, 'service.wsdl'), companion);
  await writeFile(path.join(graph, 'b.xsd'), `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="${sourceNamespace}:types"><xs:include schemaLocation="import-relative-types-types.xsd"/></xs:schema>`);
  const graphProject = path.join(consumer, 'buffered-source');
  await runGenerationPipeline({wsdl: graphSource, model: 'checked-components-v1', clientOutDir: path.join(graphProject, 'client'),
    openapi: {outFile: path.join(graphProject, 'openapi.json')}, gateway: {outDir: path.join(graphProject, 'gateway'), versionSlug: 'v1', serviceSlug: 'source'}, checkedComponents: {
    selectors: [{operation: 'constructor', portType: {namespace: sourceNamespace, local: 'ImportPortType'}, binding: {namespace: sourceNamespace, local: 'ImportBinding'}}],
    service: {namespace: serviceNamespace, local: '__proto__'}, port: 'toString', fileRoots: [consumer], sourceOrigins: [], ...(signal ? {signal} : {}),
    sourceResources: [{uri: pathToFileURL(graphSource).href, file: graphSource, contentType: 'application/wsdl+xml; charset=ISO-8859-1'},
      {uri: pathToFileURL(schemaFile).href, file: schemaFile, contentType: 'application/xml; charset=UTF-16LE'},
      ...['service.wsdl', 'b.xsd'].map(file => ({uri: pathToFileURL(path.join(graph, file)).href, file: path.join(graph, file)}))],
  }});
  const credentials = path.join(consumer, 'credentials'); await mkdir(credentials);
  for (const name of ['test-cert.pem', 'test-key.pem', 'test-credentials.pfx']) await copyFile(path.join(root, 'test/conformance/fixtures/soap/content-model', name), path.join(credentials, name));
  await copyFile(path.join(root, 'test/helpers/bufferedInstalledProcess.ts'), path.join(consumer, 'buffered-process.ts'));
}
