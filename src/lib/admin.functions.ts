import { createServerFn } from '@tanstack/react-start';
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

export const resetCustomerPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; password: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d?.customerId ?? '')) throw new Error('Invalid customer');
    if (typeof d.password !== 'string' || d.password.length < 6 || d.password.length > 72) throw new Error('Password must be 6–72 characters');
    return { customerId: d.customerId, password: d.password };
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (error || !allowed) throw new Error('Only admins can reset passwords');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error: e } = await supabaseAdmin.auth.admin.updateUserById(data.customerId, { password: data.password });
    if (e) { console.error('Password reset failed', e.message); throw new Error('Could not reset password'); }
    return { ok: true };
  });
