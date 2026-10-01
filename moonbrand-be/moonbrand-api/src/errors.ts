import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  static invalid(message = 'La richiesta contiene dati mancanti o non validi.') {
    return new ApiError(400, 'INVALID_DATA', message);
  }

  static unauthenticated(message = 'Accedi per continuare.') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }

  static forbidden(code: string, message: string) {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Risorsa non trovata.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
}

type AnyError = Error & { code?: unknown; statusCode?: number; validation?: unknown };

function known(error: AnyError): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    const custom = error.issues.find((issue) => issue.message && !issue.message.startsWith('Invalid'));
    return ApiError.invalid(custom?.message);
  }
  if (error.code === '22P02' || error.code === '23514') return ApiError.invalid();
  if (error.code === '23503') return ApiError.invalid('Un riferimento non esiste più.');
  if (error.statusCode === 413) return new ApiError(413, 'TOO_LARGE', 'Il contenuto inviato è troppo grande.');
  if (error.validation || (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) return ApiError.invalid();
  return undefined;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<AnyError>((error, request, reply) => {
    const apiError = known(error);
    if (!apiError) {
      request.log.error({ err: error }, 'errore non gestito');
      return reply.status(500).send({ status: 500, code: 'INTERNAL_ERROR', message: 'Il servizio non è momentaneamente disponibile.' });
    }
    if (apiError.status >= 500) request.log.warn({ code: apiError.code }, apiError.message);
    return reply.status(apiError.status).send({ status: apiError.status, code: apiError.code, message: apiError.message });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send({ status: 404, code: 'NOT_FOUND', message: 'Risorsa non trovata.' });
  });
}
