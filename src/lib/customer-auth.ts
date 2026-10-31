import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

// Customers log in with phone number + password. Behind the scenes the phone becomes a private
// address in the form c9876543210@customer.local (admins use a different form, so they never clash).
export const customerEmail = (phone: string) => `c${phone}@customer.local`;

const phone10 = z.string().regex(/^[0-9]{10}$/, 'Enter a 10-digit phone number');
export const loginSchema = z.object({ phone: phone10, password: z.string().min(1, 'Enter your password').max(72) });
export const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: phone10,
  password: z.string().min(6, 'Password must be at least 6 characters').max(72),
  alt_phone: z.union([z.literal(''), z.string().regex(/^[0-9]{10}$/, 'Enter a 10-digit alternate phone number')]),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(255)]),
  address: z.string().trim().min(5, 'Delivery address is required').max(500),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  marketing_consent: z.boolean(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export function signupMetadata(v: SignupInput) {
  return {
    account_type: 'customer', name: v.name, phone: v.phone, alt_phone: v.alt_phone, contact_email: v.email, address: v.address,
    ...(v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : {}), marketing_consent: v.marketing_consent ? 'true' : 'false',
  };
}

export function friendlyAuthError(message: string | undefined, kind: 'login' | 'signup'): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login')) return 'Wrong phone number or password.';
  if (m.includes('not confirmed')) return 'This account is not confirmed yet. Please contact the shop.';
  if (m.includes('already') || m.includes('database error')) return 'This phone number already has an account. Please log in instead.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New accounts are switched off right now. Please contact the shop.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  return kind === 'login' ? 'Could not log in. Please try again.' : 'Could not create the account. Please try again.';
}

export function useCustomerSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setReady(true); });
    supabase.auth.getSession().then(({ data: current }) => { setSession(current.session); setReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, ready };
}
