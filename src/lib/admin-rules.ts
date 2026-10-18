import { z } from 'zod';

export const orderStatuses = ['Received', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'] as const;
export const productSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(100),
  category_id: z.string().uuid().nullable(),
  unit: z.string().trim().min(1, 'Unit is required').max(60),
  price: z.coerce.number().min(0).max(10000000),
  description: z.string().trim().max(2000),
  in_stock: z.boolean(),
  image_url: z.string().max(2000).nullable(),
});

export function customerContact(phone: string) {
  if (!/^\d{10}$/.test(phone)) return null;
  return { call: `tel:+91${phone}`, whatsapp: `https://wa.me/91${phone}` };
}

type SummaryOrder = { created_at: string; total: number; status: string };
export function indiaDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function dashboardStats(orders: SummaryOrder[], now = new Date()) {
  const today = indiaDate(now);
  const local = new Date(`${today}T00:00:00Z`);
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  const start = monday.toISOString().slice(0, 10);
  return {
    today: orders.filter(o => indiaDate(new Date(o.created_at)) === today).length,
    pending: orders.filter(o => ['Received', 'Confirmed'].includes(o.status)).length,
    total: orders.length,
    sales: orders.filter(o => o.status !== 'Cancelled' && indiaDate(new Date(o.created_at)) >= start && new Date(o.created_at) <= now).reduce((s, o) => s + Number(o.total), 0),
  };
}