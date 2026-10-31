import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getAdminData = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (roleError) throw new Error('Unable to check admin access');
    if (!allowed) return { allowed: false, products: [], categories: [], orders: [], customers: [], items: [] };
    const [products, categories, orders, customers, items] = await Promise.all([
      context.supabase.from('products').select('*').order('name'),
      context.supabase.from('categories').select('*').order('sort_order').order('name'),
      context.supabase.from('orders').select('*').order('created_at', { ascending: false }),
      context.supabase.from('customers').select('*').order('created_at', { ascending: false }),
      context.supabase.from('order_items').select('*'),
    ]);
    if ([products, categories, orders, customers, items].some(r => r.error)) throw new Error('Unable to load shop data');
    return { allowed: true, products: products.data ?? [], categories: categories.data ?? [], orders: orders.data ?? [], customers: customers.data ?? [], items: items.data ?? [] };
  });

// Customers log in with phone + password and there is no SMS reset, so the shop owner sets a temporary password.
export const resetCustomerPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid(), password: z.string().min(6, 'Password must be at least 6 characters').max(72) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (roleError || !allowed) throw new Error('Admin access required');
    const { data: row } = await context.supabase.from('customers').select('auth_user_id').eq('id', data.customerId).maybeSingle();
    if (!row?.auth_user_id) throw new Error('This customer does not have an account');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.auth_user_id, { password: data.password });
    if (error) throw new Error('Could not reset the password');
    return { ok: true as const };
  });
