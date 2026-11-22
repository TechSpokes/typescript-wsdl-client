import assert from 'node:assert/strict';
import {MIMEType} from 'node:util';
import {SaxesParser} from 'saxes';

export const media = 'http://www.onvif.org/ver10/media/wsdl';
export const schema = 'http://www.onvif.org/ver10/schema';
export const soap = 'http://www.w3.org/2003/05/soap-envelope';
const vendor = 'urn:owned:media-extension';
const token = 'profile-001 & camera';
const snapshotUri = 'https://example.invalid/frame?value=1&size=2';
const streamUri = 'rtsp://example.invalid/stream?value=1&size=2';
const q = (namespace: string, local: string) => `{${namespace}}${local}`;
const escaped = (text: string) => text.replaceAll('&', '&amp;');

export const envelope = (body: string) => `<s:Envelope xmlns:s="${soap}" xmlns:m="${media}" xmlns:t="${schema}"
  xmlns:v="${vendor}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body>${body}</s:Body></s:Envelope>`;

const uriFields = (uri: string) => `<t:Uri>${escaped(uri)}</t:Uri><t:InvalidAfterConnect>false</t:InvalidAfterConnect>
  <t:InvalidAfterReboot>false</t:InvalidAfterReboot><t:Timeout>PT0S</t:Timeout>`;
const uriContent = (uri: string) => [{Uri: uri}, {InvalidAfterConnect: false}, {InvalidAfterReboot: false}, {Timeout: 'PT0S'}];
const known = '<m:GetGuaranteedNumberOfVideoEncoderInstancesResponse><m:TotalNumber>3</m:TotalNumber></m:GetGuaranteedNumberOfVideoEncoderInstancesResponse>';
const unknown = '<v:Uri v:mode="007"> 04 &amp; <v:Flag/> </v:Uri>';
const urlResponse = (operation: string, fields: string, attribute = '') =>
  `<m:${operation}Response><m:MediaUri${attribute}>${fields}</m:MediaUri></m:${operation}Response>`;
const snapshot = (fields: string) => urlResponse('GetSnapshotUri', fields, ' v:hint="008"');
const videoSource = (id: string, framerate: string, width: number, height: number) =>
  `<m:VideoSources token="${id}"><t:Framerate>${framerate}</t:Framerate><t:Resolution><t:Width>${width}</t:Width><t:Height>${height}</t:Height></t:Resolution></m:VideoSources>`;
const videoSources = `<m:GetVideoSourcesResponse>${videoSource('source-one', '30', 1920, 1080)}
  ${videoSource('source-two', '12.5', 640, 480)}</m:GetVideoSourcesResponse>`;

const rate = '<t:RateControl><t:FrameRateLimit>25</t:FrameRateLimit><t:EncodingInterval>1</t:EncodingInterval><t:BitrateLimit>2048</t:BitrateLimit></t:RateControl>';
const h264 = '<t:H264><t:GovLength>25</t:GovLength><t:H264Profile>Main</t:H264Profile></t:H264>';
const vendorRate = '<v:RateControl> 007 &amp; </v:RateControl>';
const encoder = (id: string, width: number, height: number, encoding: string, optional: string, tail = '') =>
  `<m:Configurations token="${id}"><t:Name>${id}</t:Name><t:UseCount>2</t:UseCount><t:Encoding>${encoding}</t:Encoding>
  <t:Resolution><t:Width>${width}</t:Width><t:Height>${height}</t:Height></t:Resolution><t:Quality>004.50</t:Quality>${optional}
  <t:Multicast><t:Address><t:Type>IPv4</t:Type><t:IPv4Address>239.0.0.1</t:IPv4Address></t:Address>
  <t:Port>5004</t:Port><t:TTL>3</t:TTL><t:AutoStart>false</t:AutoStart></t:Multicast><t:SessionTimeout>PT060S</t:SessionTimeout>${tail}</m:Configurations>`;
const encoderResponse = (operation: string, configurations: string) =>
  `<m:${operation}Response>${configurations}</m:${operation}Response>`;
const expectedEncoder = (id: string, width: number, height: number, encoding: string, optional: object[], tail: object[] = []) => ({
  token: id, $content: [{Name: id}, {UseCount: 2}, {Encoding: encoding}, {Resolution: {Width: width, Height: height}}, {Quality: '004.50'},
    ...optional, {Multicast: {$content: [{Address: {Type: 'IPv4', IPv4Address: '239.0.0.1'}}, {Port: 5004}, {TTL: 3}, {AutoStart: false}]}},
    {SessionTimeout: 'PT060S'}, ...tail],
});

export interface WireCall {
  method?: string;
  url?: string;
  xml: string;
  contentType?: string;
  soapAction?: string | string[];
  responseXml: string;
  responseStatus: number;
}

interface WireCase {
  id: string;
  payload?: object;
  response?: string;
  upstreamStatus?: number;
  status: number;
  dispatches: number;
  verify?: (json: unknown) => void;
}
export interface WireRoute {
  operation: string;
  input: object;
  requestFields: readonly string[];
  responseField: string;
  request: readonly string[];
  lexical: readonly string[];
  cases: readonly WireCase[];
}

const success = (response: string, verify: WireCase['verify'], id = 'success'): WireCase => ({id, response, status: 200, dispatches: 1, verify});
const invalid = (id: string, response: string, rule: string): WireCase => ({id, response, status: 502, dispatches: 1,
  verify: json => assert.ok(JSON.stringify(json).includes(rule), `Expected native diagnostic ${rule}: ${JSON.stringify(json)}`)});
const noToken: WireCase = {id: 'missing-profile-token', payload: {}, status: 400, dispatches: 0};
const fault: WireCase = {id: 'receiver-fault', upstreamStatus: 500, status: 502, dispatches: 1,
  response: '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Owned media fault</s:Text></s:Reason></s:Fault>',
  verify(json) {
    const {fault} = json as {fault: {code: unknown; string: unknown}};
    assert.deepEqual(fault.code, {namespace: soap, local: 'Receiver'});
    assert.equal(fault.string, 'Owned media fault');
  }};

const snapshotFields = uriFields(snapshotUri);
export const snapshotRoute: WireRoute = {
  operation: 'GetSnapshotUri', input: {ProfileToken: token}, requestFields: ['ProfileToken'], responseField: 'MediaUri',
  request: [q(media, 'ProfileToken')], lexical: [token],
  cases: [
    success(snapshot(snapshotFields + known + unknown), json => {
      const {MediaUri} = json as {MediaUri: {$attributes: unknown; $content: unknown}};
      assert.deepEqual(MediaUri.$attributes, [{hint: {$namespace: vendor, $value: '008'}}]);
      assert.deepEqual(MediaUri.$content, [...uriContent(snapshotUri),
        {GetGuaranteedNumberOfVideoEncoderInstancesResponse: {$namespace: media, TotalNumber: 3}},
        {Uri: {$namespace: vendor, $attributes: [{mode: {$namespace: vendor, $value: '007'}}],
          $content: [{$value: ' 04 & '}, {Flag: {$namespace: vendor, $content: []}}, {$value: ' '}]}}]);
    }),
    noToken,
    invalid('missing-timeout', snapshot(snapshotFields.replace('<t:Timeout>PT0S</t:Timeout>', '')), 'ordered-particle-language'),
    invalid('invalid-typed-extension', snapshot(snapshotFields + known.replace('>3<', '>invalid<')), 'cvc-datatype-valid'),
    invalid('unknown-type-override', snapshot(snapshotFields + '<v:Uri xsi:type="m:Unknown"/>'), 'opaque-wildcard-declaration'),
    invalid('known-declaration-in-opaque-extension', snapshot(snapshotFields + '<v:Uri><m:GetGuaranteedNumberOfVideoEncoderInstancesResponse/></v:Uri>'), 'opaque-wildcard-declaration'),
    fault,
  ],
};

const streamInput = {$namespaces: {'': '', m: media, t: schema},
  StreamSetup: {$content: [{Stream: 'RTP-Unicast'}, {Transport: {Protocol: 'RTSP'}}]}, ProfileToken: token};
const streamFields = uriFields(streamUri);
export const existingRoutes: readonly WireRoute[] = [
  {operation: 'GetVideoSources', input: {}, requestFields: [], responseField: 'VideoSources', request: [], lexical: [], cases: [
    success(videoSources, json => {
      const {VideoSources} = json as {VideoSources: Array<Record<string, unknown>>};
      assert.deepEqual(VideoSources.map(({token, Framerate, Resolution}) => ({token, Framerate, Resolution})), [
        {token: 'source-one', Framerate: '30', Resolution: {Width: 1920, Height: 1080}},
        {token: 'source-two', Framerate: '12.5', Resolution: {Width: 640, Height: 480}},
      ]);
    }),
    invalid('invalid-video-width', videoSources.replace('>1920<', '>invalid<'), 'cvc-datatype-valid'),
  ]},
  {operation: 'GetStreamUri', input: streamInput,
    requestFields: ['$namespaces', 'ProfileToken', 'StreamSetup'], responseField: 'MediaUri',
    request: [q(media, 'StreamSetup'), q(schema, 'Stream'), q(schema, 'Transport'), q(schema, 'Protocol'), q(media, 'ProfileToken')],
    lexical: ['RTP-Unicast', 'RTSP', token], cases: [
      success(urlResponse('GetStreamUri', streamFields), json => {
        assert.deepEqual((json as {MediaUri: {$content: unknown}}).MediaUri.$content, uriContent(streamUri));
      }),
      {id: 'missing-profile-token', payload: {$namespaces: streamInput.$namespaces, StreamSetup: streamInput.StreamSetup}, status: 400, dispatches: 0},
      {id: 'missing-namespace-boundary', payload: {StreamSetup: streamInput.StreamSetup, ProfileToken: token}, status: 400, dispatches: 0,
        verify: json => assert.match(JSON.stringify(json), /namespace-boundary-required/)},
      invalid('missing-stream-uri', urlResponse('GetStreamUri', streamFields.replace(/<t:Uri>.*?<\/t:Uri>/, '')), 'ordered-particle-language'),
    ]},
  snapshotRoute,
];

const list = 'GetVideoEncoderConfigurations', compatible = 'GetCompatibleVideoEncoderConfigurations';
const mainEncoder = encoder('encoder-main', 1920, 1080, 'H264', h264, vendorRate);
const basicEncoder = encoder('encoder-basic', 640, 480, 'JPEG', '');
const compatibleEncoder = encoder('encoder-compatible', 1280, 720, 'H264', rate + h264);
export const encoderPayload = `<m:${list}Response xmlns:m="${media}" xmlns:t="${schema}" xmlns:v="${vendor}">${mainEncoder}${basicEncoder}</m:${list}Response>`;
function expectEncoders(expected: ReturnType<typeof expectedEncoder>[]) {
  return (json: unknown) => {
    const {Configurations} = json as {Configurations: Array<{$content: unknown; token: unknown}>};
    assert.deepEqual(Configurations.map(({token, $content}) => ({token, $content})), expected);
  };
}
const h264Content = {H264: {GovLength: 25, H264Profile: 'Main'}};
export const encoderRoutes: readonly WireRoute[] = [
  {operation: list, input: {}, requestFields: [], responseField: 'Configurations', request: [], lexical: [], cases: [
    success(encoderResponse(list, mainEncoder + basicEncoder), expectEncoders([
      expectedEncoder('encoder-main', 1920, 1080, 'H264', [h264Content],
        [{RateControl: {$namespace: vendor, $content: [{$value: ' 007 & '}]}}]),
      expectedEncoder('encoder-basic', 640, 480, 'JPEG', []),
    ])),
    success(encoderResponse(list, ''), expectEncoders([]), 'empty-list'),
    invalid('invalid-encoding', encoderResponse(list, mainEncoder.replace('>H264<', '>H265<')), 'cvc-enumeration-valid'),
    invalid('missing-session-timeout', encoderResponse(list, mainEncoder.replace('<t:SessionTimeout>PT060S</t:SessionTimeout>', '')), 'ordered-particle-language'),
    invalid('invalid-typed-extension', encoderResponse(list, mainEncoder.replace(vendorRate, known.replace('>3<', '>invalid<'))), 'cvc-datatype-valid'),
  ]},
  {operation: compatible, input: {ProfileToken: token}, requestFields: ['ProfileToken'], responseField: 'Configurations',
    request: [q(media, 'ProfileToken')], lexical: [token], cases: [
    success(encoderResponse(compatible, compatibleEncoder), expectEncoders([
      expectedEncoder('encoder-compatible', 1280, 720, 'H264',
        [{RateControl: {FrameRateLimit: 25, EncodingInterval: 1, BitrateLimit: 2048}}, h264Content]),
    ])),
    noToken,
  ]},
];

export function checkRequest(route: WireRoute, call: WireCall): void {
  assert.equal(call.method, 'POST');
  assert.equal(call.url, '/media');
  const type = new MIMEType(call.contentType ?? '');
  assert.equal(type.essence, 'application/soap+xml');
  assert.equal(type.params.get('action'), route.operation === 'GetVideoSources' ? media + 'GetVideoSources/' : `${media}/${route.operation}`);
  assert.equal(call.soapAction, undefined);
  const events: string[] = [], lexical: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', node => events.push(q(node.uri, node.local)));
  parser.on('closetag', node => events.push('/' + q(node.uri, node.local)));
  parser.on('text', value => {if (value.trim()) lexical.push(value);});
  parser.write(call.xml).close();
  const children = route.operation === 'GetStreamUri' ?
    [route.request[0], route.request[1], '/' + route.request[1], route.request[2], route.request[3], '/' + route.request[3],
      '/' + route.request[2], '/' + route.request[0], route.request[4], '/' + route.request[4]] :
    route.request.flatMap(name => [name, '/' + name]);
  const wrapped = [q(soap, 'Envelope'), q(soap, 'Body'), q(media, route.operation)];
  assert.deepEqual(events, [...wrapped, ...children, ...[...wrapped].reverse().map(name => '/' + name)]);
  assert.deepEqual(lexical, route.lexical);
  if (route.lexical.includes(token)) assert.ok(call.xml.includes(escaped(token)), 'SOAP profile token escaping');
}
