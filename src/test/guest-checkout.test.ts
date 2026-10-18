import { describe, expect, it } from 'vitest';
import { guestDetailsSchema, guestOrderSchema, trackingTokenSchema } from '@/lib/guest-checkout';

const details = { name: 'Guest Buyer', phone: '9876543210', email: '', address: 'Shop 12, Main Road' };
describe('Guest checkout requirements', () => {
  it('requires a customer name', () => { expect(guestDetailsSchema.safeParse({ ...details, name: ' ' }).success).toBe(false); });
  it('requires exactly 10 numeric phone digits', () => {
    expect(guestDetailsSchema.safeParse(details).success).toBe(true);
    for (const phone of ['987654321', '98765432101', '987654321a']) expect(guestDetailsSchema.safeParse({ ...details, phone }).success).toBe(false);
  });
  it('allows no email but rejects invalid supplied emails', () => {
    expect(guestDetailsSchema.safeParse(details).success).toBe(true);
    expect(guestDetailsSchema.safeParse({ ...details, email: 'wrong' }).success).toBe(false);
  });
  it('requires a delivery address', () => { expect(guestDetailsSchema.safeParse({ ...details, address: '' }).success).toBe(false); });
  it('allows checkout without any account identifier', () => {
    expect(guestOrderSchema.safeParse({ ...details, note: '', items: [{ product_id: '123e4567-e89b-42d3-a456-426614174000', quantity: 1 }] }).success).toBe(true);
  });
  it('requires a 256-bit tracking capability rather than an order id', () => {
    expect(trackingTokenSchema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(trackingTokenSchema.safeParse('123e4567-e89b-42d3-a456-426614174000').success).toBe(false);
    expect(trackingTokenSchema.safeParse('a'.repeat(63)).success).toBe(false);
  });
});