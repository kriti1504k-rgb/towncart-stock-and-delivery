import { z } from 'zod';

export const guestDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: z.string().regex(/^[0-9]{10}$/, 'Enter a 10-digit phone number'),
  alt_phone: z.union([z.literal(''), z.string().regex(/^[0-9]{10}$/, 'Enter a 10-digit alternate phone number')]).default(''),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(255)]),
  address: z.string().trim().min(5, 'Delivery address is required').max(500),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
});
export const emptyDetails: z.infer<typeof guestDetailsSchema> = { name: '', phone: '', alt_phone: '', email: '', address: '', lat: null, lng: null };
export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;
export const guestOrderSchema = guestDetailsSchema.extend({
  note: z.string().trim().max(500),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(9999) })).min(1).max(100),
});
export const trackingTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export type GuestDetails = z.infer<typeof guestDetailsSchema>;
export type TrackedOrder = { id: string; status: string; created_at: string; name: string | null; delivery_address: string; note: string | null; total: number; items: { id: string; product_name: string; unit: string; price: number; quantity: number }[] };
export const detailsKey = 'wholesale-guest-details-v1';
export const savedOrdersKey = 'wholesale-guest-orders-v1';
export type SavedOrder = { token: string; id: string; created_at: string };

export function readSavedOrders(): SavedOrder[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(savedOrdersKey) ?? '[]');
    return z.array(z.object({ token: trackingTokenSchema, id: z.string().uuid(), created_at: z.string() })).parse(data);
  } catch { return []; }
}