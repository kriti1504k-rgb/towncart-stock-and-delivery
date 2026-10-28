import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Package, Tags, ShoppingBag, Users, Plus, Pencil, Trash2, ArrowLeft, Phone, MessageCircle, RefreshCw, Save, Upload, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InventoryTable } from '@/components/InventoryTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { getAdminData } from '@/lib/admin.functions';
import { useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/cart';
import { customerContact, dashboardStats, orderStatuses, productSchema } from '@/lib/admin-rules';
import { imagePrefix, resolveProductImage } from '@/lib/product-images';
import { LanguageProvider, LanguageToggle, useT } from '@/lib/i18n';

const sections = [
  { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Products', icon: Package },
  { name: 'Categories', icon: Tags }, { name: 'Orders', icon: ShoppingBag }, { name: 'Customers', icon: Users },
] as const;
type Section = typeof sections[number]['name'];
type Product = Tables<'products'>;
type Order = Tables<'orders'>;
const emptyProduct = { name: '', category_id: '', unit: '', price: '', description: '', image_url: null as string | null, in_stock: false, stock_quantity: '0', low_stock_threshold: '10' };

export function AdminPanel() { return <LanguageProvider><AdminPanelInner /></LanguageProvider>; }

function AdminPanelInner() {
  const { t, lang } = useT();
  const [section, setSection] = useState<Section>('Dashboard');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Tables<'categories'> | 'new' | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ table: 'products' | 'categories'; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const read = useServerFn(getAdminData);
  const query = useQuery({ queryKey: ['admin', session?.user.id], queryFn: () => read(), enabled: !!session, refetchInterval: 15000 });
  const data = query.data;
  const images = useQuery({ queryKey: ['admin-images', data?.products], enabled: !!data?.allowed, queryFn: async () => {
    const entries = await Promise.all((data?.products ?? []).map(async p => [p.id, await resolveProductImage(p.image_url)] as const));
    return Object.fromEntries(entries);
  }, refetchInterval: 1800000 });

  async function refresh() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['admin'] }), queryClient.invalidateQueries({ queryKey: ['products'] }), queryClient.invalidateQueries({ queryKey: ['categories'] }), queryClient.invalidateQueries({ queryKey: ['orders'] })]);
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); await refresh(); }
    catch (error) { toast.error(t(error instanceof Error ? error.message : 'Change could not be saved. Please try again.')); }
    finally { setBusy(false); }
  }
  function openProduct(product: Product | 'new') {
    setEditing(product); setFile(null);
    setForm(product === 'new' ? emptyProduct : { ...product, category_id: product.category_id ?? '', price: String(product.price), stock_quantity: String(product.stock_quantity), low_stock_threshold: String(product.low_stock_threshold) });
  }
  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    const parsed = productSchema.safeParse({ ...form, category_id: form.category_id || null });
    if (!parsed.success) return void toast.error(t(parsed.error.issues[0]?.message ?? 'Check product details'));
    await perform(async () => {
      let image = parsed.data.image_url;
      let uploaded: string | null = null;
      if (file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image under 5 MB');
        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
        uploaded = `${crypto.randomUUID()}.${ext}`;
        const result = await supabase.storage.from('product-images').upload(uploaded, file, { contentType: file.type });
        if (result.error) throw new Error('Image upload failed. Please try again.');
        image = imagePrefix + uploaded;
      }
      const stock = Number(form.stock_quantity); const threshold = Number(form.low_stock_threshold);
      if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0) throw new Error('Stock and alert level must be nonnegative whole numbers');
      const payload = { ...parsed.data, image_url: image, stock_quantity: stock, low_stock_threshold: threshold };
      const result = editing === 'new' ? await supabase.from('products').insert(payload) : await supabase.from('products').update(payload).eq('id', typeof editing === 'object' && editing ? editing.id : '').select('id');
      if (result.error) {
        if (uploaded) await supabase.storage.from('product-images').remove([uploaded]);
        throw new Error('Product could not be saved. Check your admin access.');
      }
      setEditing(null); toast.success(t('Product saved'));
    });
  }
  async function updateStatus(order: Order, next: Order['status']) {
    await perform(async () => {
      const { data: updated, error } = await supabase.from('orders').update({ status: next }).eq('id', order.id).select('id');
      if (error || !updated?.length) throw new Error('Order status could not be changed');
      toast.success(t('Order status updated'));
    });
  }

  if (query.isPending) return <Gate title={t('Checking admin access…')} />;
  if (query.isError) return <Gate title={t('Admin panel could not load')}><Button onClick={() => query.refetch()}><RefreshCw />{t('Try again')}</Button></Gate>;
  if (!data?.allowed) return <Gate title={t('Access denied')}><p className="text-muted-foreground">{t('This account does not have admin access.')}</p><Button asChild><Link to="/">{t('Return to shop')}</Link></Button></Gate>;

  const stats = dashboardStats(data.orders);
  const selectedOrder = data.orders.find(o => o.id === orderId);
  const customerRecord = data.customers.find(c => c.id === selectedOrder?.customer_id);
  const selectedCustomer = selectedOrder?.guest_name ? { name: selectedOrder.guest_name, phone: selectedOrder.guest_phone ?? '', address: selectedOrder.delivery_address } : customerRecord;
  const contact = selectedCustomer ? customerContact(selectedCustomer.phone) : null;
  const q = search.trim().toLowerCase();
  const visibleOrders = data.orders.filter(o => {
    const c = data.customers.find(c => c.id === o.customer_id);
    return (status === 'All' || o.status === status) && (!q || `${o.id} ${o.guest_name ?? c?.name} ${o.guest_phone ?? c?.phone}`.toLowerCase().includes(q));
  });
  const showOrders = (orders: Order[]) => <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-4">{t('Order / customer')}</th><th className="p-4">{t('Placed')}</th><th className="p-4">{t('Total')}</th><th className="p-4">{t('Status')}</th><th className="p-4"><span className="sr-only">{t('Open')}</span></th></tr></thead><tbody>{orders.map(o => {
    const c = data.customers.find(c => c.id === o.customer_id);
    return <tr key={o.id} className="border-b last:border-0"><td className="p-4"><span className="font-bold">#{o.id.slice(0, 8).toUpperCase()}</span>{o.status === 'Received' && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">{t('NEW')}</span>}<div className="mt-1 text-muted-foreground">{o.guest_name ?? c?.name ?? t('Customer')}</div></td><td className="p-4 text-muted-foreground">{formatDate(o.created_at)}</td><td className="p-4 font-bold">{formatINR(Number(o.total))}</td><td className="p-4"><StatusBadge status={o.status} /></td><td className="p-4"><Button variant="outline" size="sm" onClick={() => setOrderId(o.id)}>{t('Open')}</Button></td></tr>;
  })}</tbody></table>{!orders.length && <Empty>{t('No orders found.')}</Empty>}</div>;

  return <div className="min-h-screen bg-background pb-24 md:pb-0">
    <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r bg-surface md:flex">
      <Link to="/" className="flex items-center gap-2 border-b px-5 py-6 text-lg font-extrabold"><span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">W</span>Wholesale Mart</Link>
      <span className="px-5 pb-3 pt-7 text-xs font-bold uppercase text-muted-foreground">{t('Store management')}</span>
      <nav className="space-y-1 px-3">{sections.map(s => <Button key={s.name} variant={section === s.name ? 'secondary' : 'ghost'} className="h-11 w-full justify-start" onClick={() => { setSection(s.name); setSearch(''); }}><s.icon />{t(s.name)}{s.name === 'Orders' && stats.pending > 0 && <span className="ml-auto text-xs">{stats.pending}</span>}</Button>)}</nav>
      <div className="mt-auto border-t p-4"><Button asChild variant="ghost" className="w-full justify-start"><Link to="/"><ArrowLeft />{t('Customer shop')}</Link></Button><Button variant="ghost" className="w-full justify-start" onClick={() => supabase.auth.signOut()}><LogOut />{t('Sign out')}</Button></div>
    </aside>
    <div className="md:ml-56">
      <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-2 border-b bg-surface/95 px-4 backdrop-blur md:px-8"><div><span className="text-sm font-bold md:hidden">Wholesale Mart · </span><span className="text-sm text-muted-foreground">{t('Admin')}</span></div><div className="flex items-center gap-2"><LanguageToggle /><Button variant="ghost" size="icon" title={t('Refresh shop data')} aria-label={t('Refresh shop data')} disabled={query.isFetching} onClick={() => refresh()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></Button><Button variant="outline" size="sm" asChild><Link to="/">{t('View shop')}<ArrowLeft className="rotate-180" /></Link></Button></div></header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold">{t(section)}</h1><p className="mt-1 text-sm text-muted-foreground">{section === 'Dashboard' ? new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) : `${section === 'Products' ? data.products.length : section === 'Categories' ? data.categories.length : section === 'Orders' ? data.orders.length : data.customers.length} ${t(section.toLowerCase())}`}</p></div>{section === 'Categories' && <Button onClick={() => { setCategory('new'); setCategoryName(''); }}><Plus />{t('Add category')}</Button>}</div>
        {section === 'Dashboard' && <>
          <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">{[{ label: t("Today's new orders"), value: stats.today, icon: ShoppingBag }, { label: t('Pending orders'), value: stats.pending, icon: Package }, { label: t('Total orders'), value: stats.total, icon: Tags }, { label: t('Sales this week'), value: formatINR(stats.sales), icon: LayoutDashboard }].map(m => <div key={m.label} className="rounded-lg border bg-surface p-4"><div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{m.label}</span><m.icon className="size-4 shrink-0 text-primary" /></div><p className="break-words text-2xl font-extrabold">{m.value}</p></div>)}</div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{t('Latest orders')}</h2><Button variant="ghost" onClick={() => setSection('Orders')}>{t('View all')}<ArrowLeft className="rotate-180" /></Button></div>
          <div className="border-y bg-surface">{showOrders(data.orders.slice(0, 6))}</div><p className="mt-3 text-xs text-muted-foreground">{t('This week: Monday–Sunday, India time. Cancelled orders excluded from sales.')}</p>
        </>}
        {section !== 'Dashboard' && section !== 'Categories' && section !== 'Products' && <div className="mb-4 flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input aria-label={`${t('Search')} ${t(section.toLowerCase())}`} placeholder={`${t('Search')} ${t(section.toLowerCase())}…`} value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm bg-surface" /></div>}
        {section === 'Products' && <InventoryTable products={data.products} categories={data.categories} images={images.data} refresh={refresh} addProduct={() => openProduct('new')} deleteProduct={p => setDeleting({ table: 'products', id: p.id, name: p.name })} />}
        {section === 'Categories' && <div className="border-y bg-surface">{data.categories.map(c => <div key={c.id} className="flex items-center gap-3 border-b p-4 last:border-0"><Tags className="size-5 text-primary" /><div className="min-w-0 flex-1"><p className="break-words font-bold">{c.name}</p><p className="text-xs text-muted-foreground">{data.products.filter(p => p.category_id === c.id).length} {t('products')}</p></div><Button size="icon" variant="ghost" aria-label={`Rename ${c.name}`} title={t('Rename category')} onClick={() => { setCategory(c); setCategoryName(c.name); }}><Pencil /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${c.name}`} title={t('Delete category')} onClick={() => setDeleting({ table: 'categories', id: c.id, name: c.name })}><Trash2 /></Button></div>)}{!data.categories.length && <Empty>{t('No categories yet.')}</Empty>}</div>}
        {section === 'Orders' && <><label className="mb-4 flex items-center gap-2 text-sm">{t('Status')}<select className="h-10 rounded-md border bg-surface px-3" value={status} onChange={e => setStatus(e.target.value)}><option value="All">{t('All')}</option>{orderStatuses.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></label><div className="border-y bg-surface">{showOrders(visibleOrders)}</div></>}
        {section === 'Customers' && <div className="overflow-x-auto border-y bg-surface"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr>{['Name', 'Phone', 'Address', 'Orders'].map(h => <th className="p-4" key={h}>{t(h)}</th>)}</tr></thead><tbody>{data.customers.filter(c => `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(q)).map(c => <tr key={c.id} className="border-b last:border-0"><td className="p-4 font-bold">{c.name}</td><td className="p-4">{c.phone}</td><td className="max-w-xs break-words p-4 text-muted-foreground">{c.address}</td><td className="p-4 font-bold">{data.orders.filter(o => o.customer_id === c.id).length}</td></tr>)}</tbody></table>{!data.customers.length && <Empty>{t('No customers yet.')}</Empty>}</div>}
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">{sections.map(s => <Button key={s.name} variant="ghost" className={`h-16 min-w-0 flex-col gap-1 rounded-none px-0 text-[10px] ${section === s.name ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={() => { setSection(s.name); setSearch(''); }}><s.icon />{t(s.name)}</Button>)}</nav>

    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing === 'new' ? t('Add product') : t('Edit product')}</DialogTitle><DialogDescription>{t('Product details and availability')}</DialogDescription></DialogHeader><form onSubmit={saveProduct} className="space-y-4"><Field label={t('Name')}><Input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label={t('Unit')}><Input required maxLength={60} placeholder={t('e.g. 5 kg bag')} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field><Field label={t('Price (₹)')}><Input required type="number" min="0" max="10000000" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field></div><Field label={t('Category')}><select className="h-10 w-full rounded-md border bg-surface px-3" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">{t('Uncategorized')}</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label={t('Description')}><textarea rows={3} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border bg-surface p-3 text-sm" /></Field><Field label={t('Product image')}><div className="flex items-center gap-3"><Upload className="size-4 text-muted-foreground" /><input type="file" accept="image/jpeg,image/png,image/webp" className="min-w-0 w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div></Field><p className="text-xs text-muted-foreground">{t('JPG, PNG or WebP · Up to 5 MB')}</p><div className="grid grid-cols-2 gap-3"><Field label={t('Opening stock')}><Input aria-label={t('Opening stock')} type="number" min="0" step="1" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} /></Field><Field label={t('Low stock alert below')}><Input aria-label={t('Low stock alert below')} type="number" min="0" step="1" value={form.low_stock_threshold} onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field></div><Button className="w-full" disabled={busy}><Save />{busy ? t('Saving…') : t('Save product')}</Button></form></DialogContent></Dialog>

    <Dialog open={category !== null} onOpenChange={open => { if (!open && !busy) setCategory(null); }}><DialogContent><DialogHeader><DialogTitle>{category === 'new' ? t('Add category') : t('Rename category')}</DialogTitle><DialogDescription>{t('Category name')}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); const name = categoryName.trim(); if (!name || name.length > 100) return void toast.error(t('Enter a category name, up to 100 characters')); void perform(async () => { const result = category === 'new' ? await supabase.from('categories').insert({ name, sort_order: data.categories.length }) : await supabase.from('categories').update({ name }).eq('id', typeof category === 'object' && category ? category.id : '').select('id'); if (result.error) throw new Error('Category could not be saved'); setCategory(null); toast.success(t('Category saved')); }); }}><Input aria-label={t('Category name')} autoFocus required maxLength={100} value={categoryName} onChange={e => setCategoryName(e.target.value)} /><Button disabled={busy} className="w-full"><Save />{busy ? t('Saving…') : t('Save category')}</Button></form></DialogContent></Dialog>

    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>{t('Delete')} {deleting?.name}?</DialogTitle><DialogDescription>{deleting?.table === 'categories' ? t('Products in this category will become uncategorized.') : t('This product will be removed from the shop. Past orders will keep their item details.')}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>{t('Cancel')}</Button><Button variant="destructive" disabled={busy} onClick={() => perform(async () => { if (!deleting) return; const { data: removed, error } = await supabase.from(deleting.table).delete().eq('id', deleting.id).select('id'); if (error || !removed?.length) throw new Error('Could not delete this item'); setDeleting(null); toast.success(t('Deleted')); })}><Trash2 />{busy ? t('Deleting…') : t('Delete')}</Button></div></DialogContent></Dialog>

    <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setOrderId(null); }}><DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>{t('Order')} #{selectedOrder?.id.slice(0, 8).toUpperCase()}</DialogTitle><DialogDescription>{selectedOrder && formatDate(selectedOrder.created_at)}</DialogDescription></DialogHeader>{selectedOrder && <><div className="flex items-center justify-between"><h3 className="font-bold">{selectedCustomer?.name ?? t('Customer')}</h3><StatusBadge status={selectedOrder.status} /></div><div className="space-y-1 text-sm"><p>{selectedCustomer?.phone}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{selectedOrder.delivery_address}</p></div>{contact && <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={contact.call}><Phone />{t('Call customer')}</a></Button><Button asChild variant="outline"><a href={contact.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle />{t('WhatsApp customer')}</a></Button></div>}{selectedOrder.note && <div className="border-l-2 border-primary pl-3 text-sm"><span className="font-bold">{t('Order note')}</span><p className="break-words text-muted-foreground">{selectedOrder.note}</p></div>}<div className="border-y">{data.items.filter(i => i.order_id === selectedOrder.id).map(i => <div key={i.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-0"><div className="min-w-0"><p className="break-words text-sm font-bold">{i.product_name}</p><p className="text-xs text-muted-foreground">{i.quantity} × {formatINR(Number(i.price))} · {i.unit}</p></div><span className="shrink-0 text-sm font-semibold">{formatINR(Number(i.price) * i.quantity)}</span></div>)}</div><div className="flex justify-between text-lg font-extrabold"><span>{t('Total')}</span><span>{formatINR(Number(selectedOrder.total))}</span></div><p className="text-xs text-muted-foreground">{t('Cash or UPI on delivery')}</p><h3 className="text-sm font-bold">{t('Change status')}</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{orderStatuses.map(s => <Button key={s} variant={selectedOrder.status === s ? 'secondary' : 'outline'} disabled={busy || selectedOrder.status === s} onClick={() => updateStatus(selectedOrder, s)}>{t(s)}</Button>)}</div></>}</DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5 text-sm font-semibold"><span>{label}</span>{children}</label>; }
function Empty({ children }: { children: ReactNode }) { return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{children}</p>; }
function Gate({ title, children }: { title: string; children?: ReactNode }) { return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"><h1 className="text-2xl font-bold">{title}</h1>{children}</div>; }
function StatusBadge({ status }: { status: string }) { const { t } = useT(); return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${status === 'Cancelled' ? 'bg-destructive/10 text-destructive' : status === 'Delivered' ? 'bg-secondary text-primary' : 'bg-muted text-foreground'}`}>{t(status)}</span>; }
function formatDate(date: string) { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(date)); }

