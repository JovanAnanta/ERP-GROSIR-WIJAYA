import {
  INVENTORY_MOVEMENT_TYPES,
  INVENTORY_ORIGIN_TYPES,
} from './inventory-origin.js';

describe('canonical inventory traceability catalog', () => {
  it('keeps document origins separate from stock event names', () => {
    expect(INVENTORY_ORIGIN_TYPES.PURCHASE_INVOICE).toBe('PURCHASE_INVOICE');
    expect(INVENTORY_MOVEMENT_TYPES.PURCHASE_RECEIPT).toBe('PURCHASE_RECEIPT');
    expect(Object.values(INVENTORY_ORIGIN_TYPES)).not.toContain(
      INVENTORY_MOVEMENT_TYPES.PURCHASE_RECEIPT,
    );
  });

  it('already reserves canonical origins for upcoming integrated modules', () => {
    expect(INVENTORY_ORIGIN_TYPES).toMatchObject({
      SALES_INVOICE: 'SALES_INVOICE',
      SALES_RETURN: 'SALES_RETURN',
      INVENTORY_LOAN: 'INVENTORY_LOAN',
      INVENTORY_LOAN_RETURN: 'INVENTORY_LOAN_RETURN',
      INVENTORY_LOAN_RECOVERY: 'INVENTORY_LOAN_RECOVERY',
      OPENING_BALANCE: 'OPENING_BALANCE',
    });
  });
});
