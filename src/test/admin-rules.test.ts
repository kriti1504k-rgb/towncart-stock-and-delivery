import { describe, it, expect } from 'vitest';
import { customerContact, dashboardStats, orderStatuses, productSchema } from '@/lib/admin-rules';

describe('Admin rules', () => {
  it('supports exactly the five requested order statuses', () => {
    expect(orderStatuses).toEqual(['Received', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled']);
  });
  it('uses a 10 digit Indian phone for call and WhatsApp', () => {
    expect(customerContact('8194096344')).toEqual({ call: 'tel:+918194096344', whatsapp: 'https://wa.me/918194096344' });
    expect(customerContact('javascript:alert(1)')).toBeNull();
  });
  const orders = [
    { created_at: '2026-10-17T20:00:00Z', status: 'Received', total: 100 },
    { created_at: '2026-10-16T09:00:00Z', status: 'Confirmed', total: 200 },
    { created_at: '2026-10-18T08:00:00Z', status: 'Cancelled', total: 900 },
    { created_at: '2026-10-11T10:00:00Z', status: 'Delivered', total: 400 },
  ];
  it('counts today using India time', () => { expect(dashboardStats(orders, new Date('2026-10-18T09:30:00Z')).today).toBe(2); });
  it('counts received and confirmed orders as pending', () => { expect(dashboardStats(orders).pending).toBe(2); });
  it('counts all orders', () => { expect(dashboardStats(orders).total).toBe(4); });
  it('sums this week excluding cancelled orders', () => { expect(dashboardStats(orders, new Date('2026-10-18T09:30:00Z')).sales).toBe(300); });
  it('rejects a negative product price', () => { expect(productSchema.safeParse({ name: 'Rice', category_id: null, unit: 'kg', price: -1, description: '', in_stock: true, image_url: null }).success).toBe(false); });
});