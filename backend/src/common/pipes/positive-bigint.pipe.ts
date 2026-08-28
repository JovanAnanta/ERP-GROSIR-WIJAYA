import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class PositiveBigIntPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new BadRequestException('ID harus berupa bilangan bulat positif.');
    }

    return value;
  }
}
