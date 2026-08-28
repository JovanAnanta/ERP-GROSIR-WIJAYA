import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>, // 1. Tambahkan <T> di sini
  ): Observable<Response<T>> {
    return next.handle().pipe(
      // 2. Sekarang 'data' otomatis terbaca sebagai tipe 'T',
      // tetapi menambahkan tipe eksplisit (data: T) akan membuat linter lebih senang
      map((data: T) => ({
        success: true,
        data,
      })),
    );
  }
}
