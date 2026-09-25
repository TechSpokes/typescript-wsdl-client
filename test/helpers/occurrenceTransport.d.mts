import type {FastifyInstance} from "fastify";

export interface OccurrenceClient {
  soapClient(): Promise<{setEndpoint(endpoint: string): void}>;
  SubmitOccurrence(args: unknown): Promise<{response: unknown}>;
}

export function verifyOccurrenceTransport(options: {
  client: OccurrenceClient;
  createGateway?: (client: OccurrenceClient) => Promise<{app: FastifyInstance; flatten: boolean}>;
}): Promise<void>;
