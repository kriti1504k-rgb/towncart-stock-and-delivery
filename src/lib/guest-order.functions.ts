import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import type { Database } from '@/integrations/supabase/types';
import { guestOrderSchema, trackingTokenSchema, type TrackedOrder } from './guest-checkout';

function publicClient() {
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
  const url = process.env['SUPABASE_URL'];
  if (!key || !url) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
    headers.set('apikey', key);
    return fetch(input, { ...init, headers });
  } } });
}

// If the customer is logged in, the browser sends their login token automatically. We check it with
// Supabase and link the order to their account. A missing or expired token simply means a guest order.
async function loggedInUserId(): Promise<string | null> {
  const header = getRequest()?.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token.split('.').length !== 3) return null;
  const client = publicClient();
  if (!client) return null;
  const { data: auth } = await client.auth.getUser(token);
  return auth.user?.id ?? null;
}

export const placeGuestOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => guestOrderSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    // Privileged writes are confined to an atomic, validating DB operation.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const hasPin = data.lat !== null && data.lng !== null;
    const account = await loggedInUserId();
    const { data: id, error } = await supabaseAdmin.rpc('place_guest_order', {
      _name: data.name, _phone: data.phone, _email: data.email, _address: data.address,
      _note: data.note, _items: data.items, _token: token,
      _alt_phone: data.alt_phone || null, _lat: hasPin ? data.lat : null, _lng: hasPin ? data.lng : null, _account: account,
    });
    if (error || !id) throw new Error(error?.message.includes('unavailable') ? 'Some items are out of stock. Please update your cart.' : 'Could not place order. Please try again.');
    return { id, token };
  });

export const trackGuestOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => trackingTokenSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const client = publicClient();
    if (!client) throw new Error('Order tracking unavailable');
    const { data: order, error } = await client.rpc('track_guest_order', { _token: data });
    if (error) throw new Error('Unable to load this order. Please try again.');
    return order as TrackedOrder | null;
  });