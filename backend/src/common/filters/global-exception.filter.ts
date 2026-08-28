import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let category = 'System Error';
    let message = 'Terjadi kesalahan sistem internal.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        category = 'System Error';
        message = 'Terjadi kesalahan sistem internal.';
        this.logInternalError(exception, request);
      } else if (status === HttpStatus.BAD_REQUEST) {
        category = 'Validation Error';
        message =
          this.extractMessage(exceptionResponse) || 'Format data tidak valid.';
      } else if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN
      ) {
        category = 'Authentication Error';
        message =
          this.extractMessage(exceptionResponse) ||
          'Anda tidak memiliki hak akses.';
      } else {
        category = 'Business Rule Error';
        message =
          this.extractMessage(exceptionResponse) ||
          'Permintaan tidak dapat diproses.';
      }
    } else if (this.isPrismaError(exception)) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      category = 'Business Rule Error';
      this.logInternalError(exception, request);

      if (exception.code === 'P2002') {
        message = 'Data yang dikirim sudah digunakan (Duplikasi).';
      }
    } else {
      this.logInternalError(exception, request);
    }

    response.status(status).json({
      success: false,
      category,
      message,
    });
  }

  private logInternalError(exception: unknown, request: Request): void {
    const safeMetadata: Record<string, unknown> = {
      method: request.method,
      path: request.originalUrl ?? request.url,
      errorType:
        exception instanceof Error
          ? exception.constructor.name
          : typeof exception,
    };

    if (this.isPrismaError(exception)) {
      safeMetadata.prismaCode = exception.code;
    }

    this.logger.error(
      `Unhandled request error: ${JSON.stringify(safeMetadata)}`,
    );
  }

  private extractMessage(response: string | object): string | null {
    if (typeof response === 'string') {
      return response;
    }
    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const res = response as { message: string | string[] };
      return Array.isArray(res.message) ? res.message[0] : res.message;
    }
    return null;
  }

  private isPrismaError(error: unknown): error is { code: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as Record<string, unknown>).code === 'string' &&
      (error as Record<string, string>).code.startsWith('P')
    );
  }
}
