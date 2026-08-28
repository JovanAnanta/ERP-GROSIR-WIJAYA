import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let category = 'System Error';
    let message = 'Terjadi kesalahan sistem internal.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status === HttpStatus.BAD_REQUEST) {
        category = 'Validation Error';
        message =
          this.extractMessage(exceptionResponse) || 'Format data tidak valid.';
      } else if (
        status === HttpStatus.UNAUTHORIZED ||
        status === HttpStatus.FORBIDDEN
      ) {
        // PERBAIKAN KRUSIAL:
        // Jangan timpa pesan aslinya! Kita harus meneruskan pesan "Akun terkunci..." ke Frontend
        category = 'Authentication Error';
        message =
          this.extractMessage(exceptionResponse) ||
          'Anda tidak memiliki hak akses.';
      } else {
        category = 'Business Rule Error';
        message =
          this.extractMessage(exceptionResponse) ||
          (exception as Error).message;
      }
    } else if (this.isPrismaError(exception)) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      category = 'Business Rule Error';

      if (exception.code === 'P2002') {
        message = 'Data yang dikirim sudah digunakan (Duplikasi).';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      category,
      message,
    });
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
