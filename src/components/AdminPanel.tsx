import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { LayoutDashboard, Package, Tags, ShoppingBag, Users, Plus, Pencil, Trash2, ArrowLeft, Phone, MessageCircle, RefreshCw, Save, Upload, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { getAdminData } from '@/lib/admin.functions';
import { useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/cart';
import { customerContact, dashboardStats, indiaDate, orderStatuses, productSchema } from '@/lib/admin-rules';
import { imagePrefix, resolveProductImage } from '@/lib/product-images';

const sections = [
  { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Products', icon: Package },
  { name: 'Categories', icon: Tags }, { name: 'Orders', icon: ShoppingBag }, { name: 'Customers', icon: Users },
] as const;
type Section = typeof sections[number]['name'];
type Product = Tables<'products'>;
type Order = Tables<'orders'>;
const emptyProduct = { name: '', category_id: '', unit: '', price: '', description: '', image_url: null as string | null, in_stock: true };

export function AdminPanel() {
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
    catch (error) { toast.error(error instanceof Error ? error.message : 'Change could not be saved. Please try again.'); }
    finally { setBusy(false); }
  }
  function openProduct(product: Product | 'new') {
    setEditing(product); setFile(null);
    setForm(product === 'new' ? emptyProduct : { ...product, category_id: product.category_id ?? '', price: String(product.price) });
  }
  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    const parsed = productSchema.safeParse({ ...form, category_id: form.category_id || null });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Check product details');
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
      const payload = { ...parsed.data, image_url: image };
      const result = editing === 'new' ? await supabase.from('products').insert(payload) : await supabase.from('products').update(payload).eq('id', typeof editing === 'object' && editing ? editing.id : '').select('id');
      if (result.error) {
        if (uploaded) await supabase.storage.from('product-images').remove([uploaded]);
        throw new Error('Product could not be saved. Check your admin access.');
      }
      setEditing(null); toast.success('Product saved');
    });
  }
  async function updateStatus(order: Order, next: Order['status']) {
    await perform(async () => {
      const { data: updated, error } = await supabase.from('orders').update({ status: next }).eq('id', order.id).select('id');
      if (error || !updated?.length) throw new Error('Order status could not be changed');
      toast.success(`Order ${next.toLowerCase()}`);
    });
  }

  if (query.isPending) return <Gate title="Checking admin access…" />;
  if (query.isError) return <Gate title="Admin panel could not load"><Button onClick={() => query.refetch()}><RefreshCw />Try again</Button></Gate>;
  if (!data?.allowed) return <Gate title="Access denied"><p className="text-muted-foreground">This account does not have admin access.</p><Button asChild><Link to="/">Return to shop</Link></Button></Gate>;

  const stats = dashboardStats(data.orders);
  const selectedOrder = data.orders.find(o => o.id === orderId);
  const selectedCustomer = data.customers.find(c => c.id === selectedOrder?.customer_id);
  const contact = selectedCustomer ? customerContact(selectedCustomer.phone) : null;
  const q = search.trim().toLowerCase();
  const visibleOrders = data.orders.filter(o => {
    const c = data.customers.find(c => c.id === o.customer_id);
    return (status === 'All' || o.status === status) && (!q || `${o.id} ${c?.name} ${c?.phone}`.toLowerCase().includes(q));
  });
  const showOrders = (orders: Order[]) => <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-4">Order / customer</th><th className="p-4">Placed</th><th className="p-4">Total</th><th className="p-4">Status</th><th className="p-4"><span className="sr-only">Open</span></th></tr></thead><tbody>{orders.map(o => {
    const c = data.customers.find(c => c.id === o.customer_id);
    return <tr key={o.id} className="border-b last:border-0"><td className="p-4"><span className="font-bold">#{o.id.slice(0, 8).toUpperCase()}</span>{o.status === 'Received' && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-bold text-primary">NEW</span>}<div className="mt-1 text-muted-foreground">{c?.name ?? 'Customer'}</div></td><td className="p-4 text-muted-foreground">{formatDate(o.created_at)}</td><td className="p-4 font-bold">{formatINR(Number(o.total))}</td><td className="p-4"><StatusBadge status={o.status} /></td><td className="p-4"><Button variant="outline" size="sm" onClick={() => setOrderId(o.id)}>Open</Button></td></tr>;
  })}</tbody></table>{!orders.length && <Empty>No orders found.</Empty>}</div>;

  return <div className="min-h-screen bg-background pb-24 md:pb-0">
    <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r bg-surface md:flex">
      <Link to="/" className="flex items-center gap-2 border-b px-5 py-6 text-lg font-extrabold"><span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">W</span>Wholesale Mart</Link>
      <span className="px-5 pb-3 pt-7 text-xs font-bold uppercase text-muted-foreground">Store management</span>
      <nav className="space-y-1 px-3">{sections.map(s => <Button key={s.name} variant={section === s.name ? 'secondary' : 'ghost'} className="h-11 w-full justify-start" onClick={() => { setSection(s.name); setSearch(''); }}><s.icon />{s.name}{s.name === 'Orders' && stats.pending > 0 && <span className="ml-auto text-xs">{stats.pending}</span>}</Button>)}</nav>
      <div className="mt-auto border-t p-4"><Button asChild variant="ghost" className="w-full justify-start"><Link to="/"><ArrowLeft />Customer shop</Link></Button><Button variant="ghost" className="w-full justify-start" onClick={() => supabase.auth.signOut()}><LogOut />Sign out</Button></div>
    </aside>
    <div className="md:ml-56">
      <header className="sticky top-0 z-10 flex min-h-16 items-center justify-between gap-2 border-b bg-surface/95 px-4 backdrop-blur md:px-8"><div><span className="text-sm font-bold md:hidden">Wholesale Mart · </span><span className="text-sm text-muted-foreground">Admin</span></div><div className="flex items-center gap-2"><Button variant="ghost" size="icon" title="Refresh shop data" aria-label="Refresh shop data" disabled={query.isFetching} onClick={() => refresh()}><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></Button><Button variant="outline" size="sm" asChild><Link to="/">View shop<ArrowLeft className="rotate-180" /></Link></Button></div></header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-extrabold">{section}</h1><p className="mt-1 text-sm text-muted-foreground">{section === 'Dashboard' ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) : `${section === 'Products' ? data.products.length : section === 'Categories' ? data.categories.length : section === 'Orders' ? data.orders.length : data.customers.length} ${section.toLowerCase()}`}</p></div>{section === 'Products' && <Button onClick={() => openProduct('new')}><Plus />Add product</Button>}{section === 'Categories' && <Button onClick={() => { setCategory('new'); setCategoryName(''); }}><Plus />Add category</Button>}</div>
        {section === 'Dashboard' && <>
          <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">{[{ label: "Today's new orders", value: stats.today, icon: ShoppingBag }, { label: 'Pending orders', value: stats.pending, icon: Package }, { label: 'Total orders', value: stats.total, icon: Tags }, { label: 'Sales this week', value: formatINR(stats.sales), icon: LayoutDashboard }].map(m => <div key={m.label} className="rounded-lg border bg-surface p-4"><div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{m.label}</span><m.icon className="size-4 shrink-0 text-primary" /></div><p className="break-words text-2xl font-extrabold">{m.value}</p></div>)}</div>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Latest orders</h2><Button variant="ghost" onClick={() => setSection('Orders')}>View all<ArrowLeft className="rotate-180" /></Button></div>
          <div className="border-y bg-surface">{showOrders(data.orders.slice(0, 6))}</div><p className="mt-3 text-xs text-muted-foreground">This week: Monday–Sunday, India time. Cancelled orders excluded from sales.</p>
        </>}
        {section !== 'Dashboard' && section !== 'Categories' && <div className="mb-4 flex items-center gap-2"><Search className="size-4 text-muted-foreground" /><Input aria-label={`Search ${section.toLowerCase()}`} placeholder={`Search ${section.toLowerCase()}…`} value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm bg-surface" /></div>}
        {section === 'Products' && <div className="overflow-x-auto border-y bg-surface"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr>{['Product', 'Category', 'Price', 'Availability', 'Actions'].map(t => <th key={t} className="p-4">{t}</th>)}</tr></thead><tbody>{data.products.filter(p => p.name.toLowerCase().includes(q)).map(p => <tr key={p.id} className="border-b last:border-0"><td className="p-4"><div className="flex items-center gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-md border bg-surface">{images.data?.[p.id] ? <img className="size-11 object-contain" src={images.data[p.id] ?? ''} alt={p.name} /> : <Package className="size-5 text-muted-foreground" />}</div><div><p className="font-bold">{p.name}</p><p className="text-xs text-muted-foreground">{p.unit}</p></div></div></td><td className="p-4 text-muted-foreground">{data.categories.find(c => c.id === p.category_id)?.name ?? 'Uncategorized'}</td><td className="p-4 font-semibold">{formatINR(Number(p.price))}</td><td className="p-4"><label className="flex items-center gap-2"><Switch aria-label={`Availability for ${p.name}`} checked={p.in_stock} disabled={busy} onCheckedChange={checked => perform(async () => { const { data: updated, error } = await supabase.from('products').update({ in_stock: checked }).eq('id', p.id).select('id'); if (error || !updated?.length) throw new Error('Availability could not be changed'); toast.success('Availability updated'); })} /><span className="text-xs">{p.in_stock ? 'Available' : 'Out of stock'}</span></label></td><td className="p-4"><div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${p.name}`} title="Edit product" onClick={() => openProduct(p)}><Pencil /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${p.name}`} title="Delete product" onClick={() => setDeleting({ table: 'products', id: p.id, name: p.name })}><Trash2 /></Button></div></td></tr>)}</tbody></table>{!data.products.filter(p => p.name.toLowerCase().includes(q)).length && <Empty>No products found.</Empty>}</div>}
        {section === 'Categories' && <div className="border-y bg-surface">{data.categories.map(c => <div key={c.id} className="flex items-center gap-3 border-b p-4 last:border-0"><Tags className="size-5 text-primary" /><div className="min-w-0 flex-1"><p className="break-words font-bold">{c.name}</p><p className="text-xs text-muted-foreground">{data.products.filter(p => p.category_id === c.id).length} products</p></div><Button size="icon" variant="ghost" aria-label={`Rename ${c.name}`} title="Rename category" onClick={() => { setCategory(c); setCategoryName(c.name); }}><Pencil /></Button><Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${c.name}`} title="Delete category" onClick={() => setDeleting({ table: 'categories', id: c.id, name: c.name })}><Trash2 /></Button></div>)}{!data.categories.length && <Empty>No categories yet.</Empty>}</div>}
        {section === 'Orders' && <><label className="mb-4 flex items-center gap-2 text-sm">Status<select className="h-10 rounded-md border bg-surface px-3" value={status} onChange={e => setStatus(e.target.value)}><option>All</option>{orderStatuses.map(s => <option key={s}>{s}</option>)}</select></label><div className="border-y bg-surface">{showOrders(visibleOrders)}</div></>}
        {section === 'Customers' && <div className="overflow-x-auto border-y bg-surface"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b bg-muted/50 text-xs text-muted-foreground"><tr>{['Name', 'Phone', 'Address', 'Orders'].map(t => <th className="p-4" key={t}>{t}</th>)}</tr></thead><tbody>{data.customers.filter(c => `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(q)).map(c => <tr key={c.id} className="border-b last:border-0"><td className="p-4 font-bold">{c.name}</td><td className="p-4">{c.phone}</td><td className="max-w-xs break-words p-4 text-muted-foreground">{c.address}</td><td className="p-4 font-bold">{data.orders.filter(o => o.customer_id === c.id).length}</td></tr>)}</tbody></table>{!data.customers.length && <Empty>No customers yet.</Empty>}</div>}
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">{sections.map(s => <Button key={s.name} variant="ghost" className={`h-16 min-w-0 flex-col gap-1 rounded-none px-0 text-[10px] ${section === s.name ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} onClick={() => { setSection(s.name); setSearch(''); }}><s.icon />{s.name}</Button>)}</nav>

    <Dialog open={editing !== null} onOpenChange={open => { if (!open && !busy) setEditing(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{editing === 'new' ? 'Add product' : 'Edit product'}</DialogTitle><DialogDescription>Product details and availability</DialogDescription></DialogHeader><form onSubmit={saveProduct} className="space-y-4"><Field label="Name"><Input required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Unit"><Input required maxLength={60} placeholder="e.g. 5 kg bag" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field><Field label="Price (₹)"><Input required type="number" min="0" max="10000000" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field></div><Field label="Category"><select className="h-10 w-full rounded-md border bg-surface px-3" value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}><option value="">Uncategorized</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Description"><textarea rows={3} maxLength={2000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full rounded-md border bg-surface p-3 text-sm" /></Field><Field label="Product image"><div className="flex items-center gap-3"><Upload className="size-4 text-muted-foreground" /><input type="file" accept="image/jpeg,image/png,image/webp" className="min-w-0 w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div></Field><p className="text-xs text-muted-foreground">JPG, PNG or WebP · Up to 5 MB</p><label className="flex items-center gap-3 text-sm"><Switch checked={form.in_stock} onCheckedChange={checked => setForm({ ...form, in_stock: checked })} />Available</label><Button className="w-full" disabled={busy}><Save />{busy ? 'Saving…' : 'Save product'}</Button></form></DialogContent></Dialog>

    <Dialog open={category !== null} onOpenChange={open => { if (!open && !busy) setCategory(null); }}><DialogContent><DialogHeader><DialogTitle>{category === 'new' ? 'Add category' : 'Rename category'}</DialogTitle><DialogDescription>Category name</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); const name = categoryName.trim(); if (!name || name.length > 100) return void toast.error('Enter a category name, up to 100 characters'); void perform(async () => { const result = category === 'new' ? await supabase.from('categories').insert({ name, sort_order: data.categories.length }) : await supabase.from('categories').update({ name }).eq('id', typeof category === 'object' && category ? category.id : '').select('id'); if (result.error) throw new Error('Category could not be saved'); setCategory(null); toast.success('Category saved'); }); }}><Input aria-label="Category name" autoFocus required maxLength={100} value={categoryName} onChange={e => setCategoryName(e.target.value)} /><Button disabled={busy} className="w-full"><Save />{busy ? 'Saving…' : 'Save category'}</Button></form></DialogContent></Dialog>

    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>{deleting?.table === 'categories' ? 'Products in this category will become uncategorized.' : 'This product will be removed from the shop. Past orders will keep their item details.'}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => perform(async () => { if (!deleting) return; const { data: removed, error } = await supabase.from(deleting.table).delete().eq('id', deleting.id).select('id'); if (error || !removed?.length) throw new Error('Could not delete this item'); setDeleting(null); toast.success('Deleted'); })}><Trash2 />{busy ? 'Deleting…' : 'Delete'}</Button></div></DialogContent></Dialog>

    <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setOrderId(null); }}><DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>Order #{selectedOrder?.id.slice(0, 8).toUpperCase()}</DialogTitle><DialogDescription>{selectedOrder && formatDate(selectedOrder.created_at)}</DialogDescription></DialogHeader>{selectedOrder && <><div className="flex items-center justify-between"><h3 className="font-bold">{selectedCustomer?.name ?? 'Customer'}</h3><StatusBadge status={selectedOrder.status} /></div><div className="space-y-1 text-sm"><p>{selectedCustomer?.phone}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{selectedOrder.delivery_address}</p></div>{contact && <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><a href={contact.call}><Phone />Call customer</a></Button><Button asChild variant="outline"><a href={contact.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp customer</a></Button></div>}{selectedOrder.note && <div className="border-l-2 border-primary pl-3 text-sm"><span className="font-bold">Order note</span><p className="break-words text-muted-foreground">{selectedOrder.note}</p></div>}<div className="border-y">{data.items.filter(i => i.order_id === selectedOrder.id).map(i => <div key={i.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-0"><div className="min-w-0"><p className="break-words text-sm font-bold">{i.product_name}</p><p className="text-xs text-muted-foreground">{i.quantity} × {formatINR(Number(i.price))} · {i.unit}</p></div><span className="shrink-0 text-sm font-semibold">{formatINR(Number(i.price) * i.quantity)}</span></div>)}</div><div className="flex justify-between text-lg font-extrabold"><span>Total</span><span>{formatINR(Number(selectedOrder.total))}</span></div><p className="text-xs text-muted-foreground">Cash or UPI on delivery</p><h3 className="text-sm font-bold">Change status</h3><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{orderStatuses.map(s => <Button key={s} variant={selectedOrder.status === s ? 'secondary' : 'outline'} disabled={busy || selectedOrder.status === s} onClick={() => updateStatus(selectedOrder, s)}>{s}</Button>)}</div></>}</DialogContent></Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block space-y-1.5 text-sm font-semibold"><span>{label}</span>{children}</label>; }
function Empty({ children }: { children: ReactNode }) { return <p className="px-4 py-12 text-center text-sm text-muted-foreground">{children}</p>; }
function Gate({ title, children }: { title: string; children?: ReactNode }) { return <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center"><h1 className="text-2xl font-bold">{title}</h1>{children}</div>; }
function StatusBadge({ status }: { status: string }) { return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-bold ${status === 'Cancelled' ? 'bg-destructive/10 text-destructive' : status === 'Delivered' ? 'bg-secondary text-primary' : 'bg-muted text-foreground'}`}>{status}</span>; }
function formatDate(date: string) { return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(date)); }