import { describe, it, expect } from 'vitest';
import { allowedQuantity, defaultLowStockThreshold, isLowStock, stockAdjustment, stockSchema, inventoryCsv } from '@/lib/inventory';

describe('Inventory rules', () => {
  it('defaults the low stock warning to 10 and warns only below it', () => { expect(defaultLowStockThreshold).toBe(10); expect(isLowStock(9)).toBe(true); expect(isLowStock(10)).toBe(false); expect(isLowStock(4, 5)).toBe(true); });
  it('starts stock at zero and requires nonnegative whole counts', () => { expect(stockSchema.parse(0)).toBe(0); expect(stockSchema.safeParse(-1).success).toBe(false); expect(stockSchema.safeParse(1.5).success).toBe(false); });
  it('never allows ordering more than stock, including zero', () => { expect(allowedQuantity(12, 5)).toBe(5); expect(allowedQuantity(1, 0)).toBe(0); });
  it('subtracts an offline sale and rejects exceeding stock', () => { expect(stockAdjustment(8, 3, 'offline sale')).toBe(5); expect(() => stockAdjustment(2, 3, 'offline sale')).toThrow(); });
  it('adds incoming warehouse stock', () => { expect(stockAdjustment(8, 3, 'stock added')).toBe(11); });
  it('exports values safely without spreadsheet formula injection', () => { expect(inventoryCsv([{name:'=1+1', category:'Food', unit:'kg', price:25, stock_quantity:2, low_stock_threshold:10, in_stock:true}])).toContain('"\'=1+1"'); });
});