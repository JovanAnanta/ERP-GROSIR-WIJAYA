import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator.js';
import { FifoController } from './fifo.controller.js';

describe('FifoController authorization', () => {
  it('requires FIFO_VIEW on every FIFO endpoint through class metadata', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, FifoController)).toEqual([
      'FIFO_VIEW',
    ]);
  });
});
