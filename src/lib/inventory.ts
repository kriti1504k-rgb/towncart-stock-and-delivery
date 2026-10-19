import { z } from 'zod';

export const stockSchema = z.coerce.number().int().min(0).max(100000000);
export const defaultLowStockThreshold = 10;
export function isLowStock(stock: number, threshold = defaultLowStockThreshold) { return stock < threshold; }
export function allowedQuantity(requested: number, stock: number) { return Math.max(0, Math.min(Math.floor(requested), stock, 9999)); }
export function stockAdjustment(stock: number, quantity: number, reason: 'offline sale' | 'stock added' | 'manual correction') {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Enter a positive whole quantity');
  const next = reason === 'offline sale' ? stock - quantity : reason === 'stock added' ? stock + quantity : quantity;
  return stockSchema.parse(next);
}
export function inventoryCsv(rows: Array<{ name: string; category: string; unit: string; price: number; stock_quantity: number; low_stock_threshold: number; in_stock: boolean }>) {
  const cell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return '\uFEFF' + [['Product name', 'Category', 'Unit', 'Price (INR)', 'Stock quantity', 'Low stock alert', 'Status'], ...rows.map(p => [p.name, p.category, p.unit, p.price, p.stock_quantity, p.low_stock_threshold, p.in_stock ? 'Available' : 'Out of stock'])].map(row => row.map(cell).join(',')).join('\r\n');
}