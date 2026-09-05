import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;

export function parsePositiveBigInt(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new BadRequestException('ID harus berupa bilangan bulat positif.');
  }

  const parsed = BigInt(value);
  if (parsed > MAX_SIGNED_BIGINT) {
    throw new BadRequestException('ID berada di luar batas yang didukung.');
  }

  return parsed;
}

@Injectable()
export class PositiveBigIntPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    parsePositiveBigInt(value);
    return value;
  }
}
