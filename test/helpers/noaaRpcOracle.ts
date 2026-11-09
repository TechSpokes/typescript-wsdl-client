/** Independent NOAA request obligations; never consumed as native qualification authority.
 * @since 1.1.9
 */
import assert from 'node:assert/strict';
import {SaxesParser} from 'saxes';
export const noaaNamespace = 'http://localhost/xml/wsdl/ndfdXML.wsdl';
export const weatherFields = ('maxt mint temp dew pop12 qpf sky snow wspd wdir wx waveh icons rh appt incw34 incw50 incw64 cumw34 cumw50 cumw64 '
  + 'critfireo dryfireo conhazo ptornado phail ptstmwinds pxtornado pxhail pxtstmwinds ptotsvrtstm pxtotsvrtstm '
  + 'tmpabv14d tmpblw14d tmpabv30d tmpblw30d tmpabv90d tmpblw90d prcpabv14d prcpblw14d prcpabv30d prcpblw30d prcpabv90d prcpblw90d '
  + 'wwa wgust iceaccum maxrh minrh evp24 evpdep24 evp168 tcsurge tcrain tcwind tctornado ppi probtsrwe24 snowlvl '
  + 'snow24e10 snow24e90 snow48e10 snow48e90 snow72e10 snow72e90 wbgt snowratio ceil vis llwsdist llwswindspd llwswinddir heatrisk').split(' ');
const weather = Object.fromEntries(weatherFields.map((name, index) => [name, index % 3 === 1]));
const start = '2026-11-09T01:23:45.6789-05:30', end = '2026-11-10T22:34:56.1234+09:45';
type Part = readonly [name: string, type: string, value: string | Record<string, boolean>];
const p = (name: string, type: string, value: string | Record<string, boolean>): Part => [name, type, value];
const decimal = (name: string, value: string) => p(name, 'decimal', value);
const text = (name: string, value: string) => p(name, 'string', value);
const named = (name: string, type: string, value: string) => p(name, 'tns:' + type, value);
const xml = text('XMLformat', 'DWML'), list = text('listType', 'latLon'), coords = text('listLatLon', '39.1234567890123456789,-76.9876543210987654321');
const times = [p('startTime', 'dateTime', start), p('endTime', 'dateTime', end)];
const flags = p('weatherParameters', 'tns:weatherParametersType', weather);
const product = named('product', 'productType', 'glance'), unit = named('Unit', 'unitType', 'm');
const feature = named('featureType', 'featureTypeType', 'Forecast_Gml2Point');
const days = [p('startDate', 'date', '2026-11-09-05:30'), p('numDays', 'integer', '9007199254740993123456789'), unit, xml, named('format', 'formatType', '24 hourly')];
export const noaaCases: readonly {operation: string; output: string; parts: readonly Part[]}[] = [
  {operation: 'LatLonListZipCode', output: 'listLatLonOut', parts: [text('zipCodeList', '21045 20910'), xml, text('listType', 'zipCode')]},
  {operation: 'LatLonListSubgrid', output: 'listLatLonOut', parts: [xml, list, decimal('lowerLeftLatitude', '31.1234567890123456789'), decimal('lowerLeftLongitude', '-78.2345678901234567891'), decimal('upperRightLatitude', '42.3456789012345678912'), decimal('upperRightLongitude', '-67.4567890123456789123'), decimal('resolution', '2.5678901234567891234')]},
  {operation: 'LatLonListLine', output: 'listLatLonOut', parts: [xml, list, decimal('endPoint1Lat', '32.1234567890123456789'), decimal('endPoint1Lon', '-77.2345678901234567891'), decimal('endPoint2Lat', '43.3456789012345678912'), decimal('endPoint2Lon', '-66.4567890123456789123')]},
  {operation: 'LatLonListSquare', output: 'listLatLonOut', parts: [xml, list, decimal('centerPointLat', '33.1234567890123456789'), decimal('centerPointLon', '-76.2345678901234567891'), decimal('distanceLat', '4.3456789012345678912'), decimal('distanceLon', '5.4567890123456789123'), decimal('resolution', '6.5678901234567891234')]},
  {operation: 'LatLonListCityNames', output: 'listCityNamesOut', parts: [named('displayLevel', 'displayLevelType', '1234'), xml]},
  {operation: 'CornerPoints', output: 'listLatLonOut', parts: [xml, list, named('sector', 'sectorType', 'alaska')]},
  {operation: 'NDFDgenByDay', output: 'XMLByDayOut', parts: [decimal('latitude', '34.1234567890123456789'), decimal('longitude', '-75.2345678901234567891'), ...days]},
  {operation: 'NDFDgenByDayLatLonList', output: 'XMLByDayOut', parts: [coords, ...days]},
  {operation: 'GmlTimeSeries', output: 'GMLOut', parts: [coords, ...times, named('compType', 'compTypeType', 'GreaterThanEqualTo'), feature, text('propertyName', 'owned & <temperature>')]},
  {operation: 'NDFDgen', output: 'XMLOut', parts: [decimal('latitude', '35.1234567890123456789'), decimal('longitude', '-74.2345678901234567891'), product, xml, ...times, unit, flags]},
  {operation: 'NDFDgenLatLonList', output: 'XMLOut', parts: [coords, product, xml, ...times, unit, flags]},
  {operation: 'GmlLatLonList', output: 'GMLOut', parts: [coords, p('requestedTime', 'dateTime', start), feature, flags]},
];
export function noaaInput(testCase: typeof noaaCases[number]): Record<string, unknown> {
  return Object.fromEntries([...testCase.parts].reverse().map(([name, , value]) => [name,
    typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse()) : value]));
}

/** Independently compare the actual HTTP entity to source-specific wire duties. */
export function assertNoaaRequest(xml: string, testCase: typeof noaaCases[number]): void {
  const soap = 'http://schemas.xmlsoap.org/soap/envelope/', xsi = 'http://www.w3.org/2001/XMLSchema-instance';
  const xsd = 'http://www.w3.org/2001/XMLSchema', body = 'https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl';
  type Node = {namespace: string; local: string; type?: string; scope: Record<string, string>; text: string; children: Node[]};
  const stack: Node[] = [], roots: Node[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => {
    const node: Node = {namespace: tag.uri, local: tag.local, type: Object.values(tag.attributes).find(a => a.uri === xsi && a.local === 'type')?.value,
      scope: {...stack.at(-1)?.scope, ...tag.ns}, text: '', children: []};
    (stack.at(-1)?.children ?? roots).push(node); stack.push(node);
  });
  parser.on('text', text => {stack.at(-1)!.text += text;});
  parser.on('closetag', () => {stack.pop();});
  parser.write(xml).close();
  assert.equal(roots.length, 1);
  const envelope = roots[0]!; assert.equal(envelope.namespace, soap); assert.equal(envelope.local, 'Envelope');
  assert.equal(envelope.children.length, 1);
  const container = envelope.children[0]!; assert.equal(container.namespace, soap); assert.equal(container.local, 'Body');
  assert.equal(container.children.length, 1);
  const wrapper = container.children[0]!; assert.equal(wrapper.namespace, body); assert.equal(wrapper.local, testCase.operation);
  assert.deepEqual(wrapper.children.map(node => [node.namespace, node.local]), testCase.parts.map(([name]) => ['', name]));
  const type = (node: Node, expected: string) => {
    assert.ok(node.type, `Missing xsi:type for ${node.local}`);
    const [prefix, local] = node.type.split(':');
    assert.equal(local, expected.replace('tns:', ''));
    assert.equal(node.scope[prefix!], expected.startsWith('tns:') ? noaaNamespace : xsd);
  };
  testCase.parts.forEach(([, expectedType, value], index) => {
    const node = wrapper.children[index]!; type(node, expectedType);
    if (typeof value === 'string') {assert.equal(node.text, value); assert.equal(node.children.length, 0);}
    else {
      assert.equal(node.children.length, 73);
      assert.deepEqual(node.children.map(field => [field.namespace, field.local]), weatherFields.map(name => ['', name]));
      for (const field of node.children) {type(field, 'boolean'); assert.equal(field.text, String(value[field.local])); assert.equal(field.children.length, 0);}
    }
  });
}
