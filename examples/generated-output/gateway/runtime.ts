/**
 * Gateway Runtime Utilities
 *
 * Provides envelope builders and error handling for the generated gateway.
 * Auto-generated - do not edit manually.
 */
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Success response envelope
 */
export interface SuccessEnvelope<T> {
  status: "SUCCESS";
  message: string | null;
  data: T;
  error: null;
}

/**
 * Error response envelope
 */
export interface ErrorEnvelope {
  status: "ERROR";
  message: string;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Union type for response envelopes
 */
export type ResponseEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * Builds a success response envelope
 *
 * @param data - The response data
 * @param message - Optional success message
 * @returns Success envelope wrapping the data
 */
export function buildSuccessEnvelope<T>(data: T, message?: string): SuccessEnvelope<T> {
  return {
    status: "SUCCESS",
    message: message ?? null,
    data,
    error: null,
  };
}

/**
 * Builds an error response envelope
 *
 * @param code - Error code (e.g., "VALIDATION_ERROR")
 * @param message - Human-readable error message
 * @param details - Optional error details
 * @returns Error envelope with the error information
 */
export function buildErrorEnvelope(
  code: string,
  message: string,
  details?: unknown
): ErrorEnvelope {
  return {
    status: "ERROR",
    message,
    data: null,
    error: { code, message, details },
  };
}

/**
 * Classified error with HTTP status and details
 */
export interface ClassifiedError {
  httpStatus: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Classifies an error and maps it to an appropriate HTTP status code
 *
 * @param err - The error to classify
 * @returns Classified error with HTTP status, code, and message
 */
export function classifyError(err: unknown): ClassifiedError {
  // Fastify validation errors
  if (err && typeof err === "object" && "validation" in err) {
    return {
      httpStatus: 400,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: (err as Record<string, unknown>).validation,
    };
  }

  // SOAP fault errors (node-soap throws these)
  if (err && typeof err === "object" && "root" in err) {
    const root = (err as Record<string, unknown>).root as Record<string, unknown> | undefined;
    const envelope = root?.Envelope as Record<string, unknown> | undefined;
    const body = envelope?.Body as Record<string, unknown> | undefined;
    const fault = body?.Fault as Record<string, unknown> | undefined;
    if (fault) {
      return {
        httpStatus: 502,
        code: "SOAP_FAULT",
        message: (fault.faultstring as string) || "SOAP service returned a fault",
        details: fault,
      };
    }
  }

  // Connection/timeout errors
  if (err instanceof Error) {
    if (err.message.includes("ECONNREFUSED") || err.message.includes("ENOTFOUND")) {
      return {
        httpStatus: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Unable to connect to SOAP service",
        details: err.message,
      };
    }
    if (err.message.includes("ETIMEDOUT") || err.message.includes("timeout")) {
      return {
        httpStatus: 504,
        code: "GATEWAY_TIMEOUT",
        message: "SOAP service request timed out",
        details: err.message,
      };
    }
  }

  // Generic error fallback
  const message = err instanceof Error ? err.message : String(err);
  return {
    httpStatus: 500,
    code: "INTERNAL_ERROR",
    message,
    details: process.env.NODE_ENV === "development" ? err : undefined,
  };
}

/**
 * Creates a gateway error handler for this service
 *
 * @returns Fastify error handler function
 */
export function createGatewayErrorHandler_v1_weather() {
  return async function gatewayErrorHandler(
    error: Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<ErrorEnvelope> {
    const classified = classifyError(error);

    request.log.error({
      err: error,
      classified,
      url: request.url,
      method: request.method,
    }, "Gateway error");

    reply.status(classified.httpStatus);
    return buildErrorEnvelope(classified.code, classified.message, classified.details);
  };
}
