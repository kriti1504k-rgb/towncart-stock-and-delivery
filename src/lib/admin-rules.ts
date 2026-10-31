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
// Spreadsheet programs run cells that start with = + - @ as formulas, so such text is defused with a leading apostrophe.
const csvCell = (value: string | number | boolean | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export type CustomerCsvRow = {
  name: string; phone: string; alt_phone: string | null; email: string | null; address: string; maps_link: string | null;
  marketing_consent: boolean; auth_user_id: string | null; created_at: string; orders: number;
};
export function customersCsv(rows: CustomerCsvRow[]) {
  const header = ['Name', 'Phone', 'Alternate phone', 'Email', 'Address', 'Google Maps link', 'Agreed to offers', 'Has account', 'Joined', 'Orders'];
  const lines = rows.map(r => [r.name, r.phone, r.alt_phone, r.email, r.address, r.maps_link, r.marketing_consent ? 'Yes' : 'No', r.auth_user_id ? 'Yes' : 'No', r.created_at.slice(0, 10), r.orders].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}
