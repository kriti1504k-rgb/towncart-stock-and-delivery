import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { setResponseHeader } from '@tanstack/react-start/server';
import type { Database } from '@/integrations/supabase/types';
import { guestOrderSchema, trackingTokenSchema, type TrackedOrder } from './guest-checkout';

export const placeGuestOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => guestOrderSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    // Privileged writes are confined to an atomic, validating DB operation.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: id, error } = await supabaseAdmin.rpc('place_guest_order', {
      _name: data.name, _phone: data.phone, _email: data.email, _address: data.address,
      _note: data.note, _items: data.items, _token: token,
    });
    if (error || !id) throw new Error(error?.message.includes('unavailable') ? 'Some items are out of stock. Please update your cart.' : 'Could not place order. Please try again.');
    return { id, token };
  });

export const trackGuestOrder = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => trackingTokenSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const key = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? process.env['SUPABASE_ANON_KEY'];
    const url = process.env['SUPABASE_URL'];
    if (!key || !url) throw new Error('Order tracking unavailable');
    const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith('sb_') && headers.get('Authorization') === `Bearer ${key}`) headers.delete('Authorization');
      headers.set('apikey', key);
      return fetch(input, { ...init, headers });
    } } });
    const { data: order, error } = await client.rpc('track_guest_order', { _token: data });
    if (error) throw new Error('Unable to load this order. Please try again.');
    return order as TrackedOrder | null;
  });