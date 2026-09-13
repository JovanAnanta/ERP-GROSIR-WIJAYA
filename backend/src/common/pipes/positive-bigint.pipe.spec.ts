import { BadRequestException } from '@nestjs/common';
import { PositiveBigIntPipe } from './positive-bigint.pipe.js';

describe('PositiveBigIntPipe', () => {
  const pipe = new PositiveBigIntPipe();

  it('keeps valid positive integer IDs unchanged', () => {
    expect(pipe.transform('9223372036854775807')).toBe('9223372036854775807');
  });

  it.each(['abc', '1.2', '-1', '0', ''])('rejects malformed ID %p', (id) => {
    expect(() => pipe.transform(id)).toThrow(BadRequestException);
  });

  it('rejects IDs above the PostgreSQL bigint limit', () => {
    expect(() => pipe.transform('9223372036854775808')).toThrow(
      BadRequestException,
    );
  });
});
