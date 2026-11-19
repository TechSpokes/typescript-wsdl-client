import {verificationPath} from "../helpers/verificationPath.js";
import {describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {planCheckedComponents} from '../../src/checkedPlanning.js';

describe('checked native facet production path', () => {
  it('generates inherited string length and exact numeric bounds through the public pipeline', async () => {
    const directory = path.resolve(verificationPath('tmp/conformance/checked-facets'));
    await mkdir(directory, {recursive: true});
    const project = await mkdtemp(path.join(directory, 'candidate-'));
    await runGenerationPipeline({model: 'checked-components-v1', wsdl: path.resolve('test/conformance/fixtures/assessment/facets.wsdl'),
      clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
      gateway: {outDir: path.join(project, 'gateway'), serviceSlug: 'forecast', versionSlug: 'v1'}});
    const schemas = JSON.parse(await readFile(path.join(project, 'gateway/routes/0/schemas.json'), 'utf8')) as object;
    expect(JSON.stringify(schemas)).toContain('money');
  });

  it.each([
    ['contradictory inherited length', '<xs:maxLength value="4"/>', '<xs:maxLength value="1"/>', 'native-construction-unestablished'],
    ['invalid bound formation', '9007199254740993.99', '9007199254740993.00', 'native-construction-unestablished'],
    ['document-wide second member', 'memberTypes="b:Nested b:Word"', 'memberTypes="b:Nested xs:IDREF"', 'scalar-correspondence-scope'],
    ['wider patterned family', 'base="xs:int"><xs:pattern value="[+]00[0-9]"', 'base="xs:float"><xs:pattern value="[+]00[0-9]"', 'scalar-facet-correspondence-scope'],
  ])('keeps %s distinct from payload invalidity', async (_label, from, to, rule) => {
    const directory = path.resolve(verificationPath('tmp/conformance/checked-facets')); await mkdir(directory, {recursive: true});
    const project = await mkdtemp(path.join(directory, 'refusal-')), file = path.join(project, 'source.wsdl');
    const original = await readFile('test/conformance/fixtures/assessment/facets.wsdl', 'utf8');
    await writeFile(file, original.replace(from, to));
    const result = await planCheckedComponents(file);
    expect(result.ready).toBe(false);
    expect(JSON.stringify(result.blockers)).toContain(rule);
  });

  it('composes qualified heterogeneous union list items through public planning', async () => {
    const directory = path.resolve(verificationPath('tmp/conformance/checked-facets')); await mkdir(directory, {recursive: true});
    const project = await mkdtemp(path.join(directory, 'union-list-')), file = path.join(project, 'source.wsdl');
    const original = await readFile('test/conformance/fixtures/assessment/facets.wsdl', 'utf8');
    await writeFile(file, original.replace('memberTypes="b:Nested b:Word"', 'memberTypes="b:Nested xs:boolean"'));
    expect((await planCheckedComponents(file)).ready).toBe(true);
  });
});
