import {Ajv} from 'ajv';
import {composeOpenApiDocuments} from '../../src/index.js';

type Media = {content: {'application/json': {schema: Record<string, unknown>}}};
export interface CheckedDocument {
  components: {schemas: Record<string, Record<string, unknown>>};
  paths: Record<string, {post: {requestBody: Media; responses: Record<string, Media>}}>;
}

export function composeCheckedDocumentation(document: unknown): CheckedDocument {
  return composeOpenApiDocuments([{key: 'checked', document}]) as unknown as CheckedDocument;
}

export function validateCheckedDocumentation(document: CheckedDocument, route: string, role: 'request' | 'response' | 'fault') {
  const operation = document.paths[route]!.post;
  const schema = role === 'request' ? operation.requestBody.content['application/json'].schema
    : operation.responses[role === 'response' ? '200' : '502']!.content['application/json'].schema;
  return new Ajv({strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false})
    .compile({...schema, components: document.components});
}
