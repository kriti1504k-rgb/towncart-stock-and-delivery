import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Minus, Search, Download, History, Trash2, Package, Upload, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { imagePrefix } from '@/lib/product-images';
import { inventoryCsv, isLowStock, stockSchema } from '@/lib/inventory';
import { productSchema } from '@/lib/admin-rules';
import { formatINR } from '@/lib/cart';

type Product = Tables<'products'>;
type Props = { products: Product[]; categories: Tables<'categories'>[]; images: Record<string, string | null> | undefined; refresh: () => Promise<void>; addProduct: () => void; deleteProduct: (p: Product) => void };
export function InventoryTable({ products, categories, images, refresh, addProduct, deleteProduct }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [saving, setSaving] = useState(0);
  const [adjust, setAdjust] = useState<{ product: Product; reason: 'offline sale' | 'stock added' } | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [history, setHistory] = useState<Product | null>(null);
  const [newCategory, setNewCategory] = useState<Product | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const ledger = useQuery({ queryKey: ['stock-history', history?.id], enabled: !!history, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('stock_history').select('*').eq('product_id', history?.id ?? '').order('created_at', { ascending: false });
    if (error) throw error; return data;
  } });
  async function run(action: () => Promise<void>) {
    setSaving(n => n + 1);
    try { await action(); await refresh(); return true; }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save. Try again.'); return false; }
    finally { setSaving(n => n - 1); }
  }
  async function update(p: Product, field: 'name' | 'unit' | 'price' | 'category_id' | 'low_stock_threshold' | 'image_url', value: string | number | null) {
    const payload = { [field]: value };
    if (field === 'low_stock_threshold') stockSchema.parse(value);
    else productSchema.parse({ ...p, ...payload });
    const { data, error } = await supabase.from('products').update(payload).eq('id', p.id).select('id');
    if (error || !data?.length) throw new Error('Product could not be saved');
  }
  async function stock(p: Product, qty: number, reason: 'offline sale' | 'stock added' | 'manual correction', absolute = false) {
    const { error } = await supabase.rpc('adjust_product_stock', { _product_id: p.id, _quantity: qty, _reason: reason, _absolute: absolute });
    if (error) throw new Error(error.message);
  }
  const visible = products.filter(p => (category === 'all' || (p.category_id ?? '') === category) && `${p.name} ${p.unit}`.toLowerCase().includes(search.toLowerCase().trim()));
  function download() {
    const csv = inventoryCsv(visible.map(p => ({ ...p, category: categories.find(c => c.id === p.category_id)?.name ?? 'Uncategorized' })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'wholesale-inventory.csv'; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="relative min-w-40 flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search inventory" placeholder="Search products…" className="h-10 bg-surface pl-9" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select aria-label="Filter inventory category" className="h-10 max-w-full rounded-md border bg-surface px-3 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Button variant="outline" onClick={download}><Download />CSV</Button><Button onClick={addProduct}><Plus />Add new product</Button>
    </div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{visible.length} products · {products.filter(p => isLowStock(p.stock_quantity, p.low_stock_threshold)).length} low stock</span><span role="status" className="flex items-center gap-1">{saving ? <><Loader2 className="size-3 animate-spin" />Saving…</> : <><Check className="size-3 text-primary" />All changes saved</>}</span></div>
    <div className="max-w-full overflow-x-auto border-y bg-surface"><table className="w-full min-w-[1100px] table-fixed text-left text-sm"><colgroup><col className="w-20" /><col className="w-48" /><col className="w-40" /><col className="w-28" /><col className="w-28" /><col className="w-64" /><col className="w-32" /><col className="w-28" /></colgroup>
      <thead className="border-b bg-muted/60 text-xs text-muted-foreground"><tr>{['Image', 'Product name', 'Category', 'Unit', 'Price (₹)', 'Stock quantity', 'Status', 'Actions'].map(label => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead>
      <tbody>{visible.map(p => <tr key={p.id} className={`border-b last:border-0 ${isLowStock(p.stock_quantity, p.low_stock_threshold) ? 'bg-warning-surface' : ''}`}>
        <td className="p-3"><label className="relative block size-12"><Button asChild variant="outline" className="size-12 p-1" title={`Upload image for ${p.name}`}><span>{images?.[p.id] ? <img src={images[p.id] ?? ''} alt={p.name} className="size-10 object-contain" /> : <Upload />}</span></Button><input aria-label={`Upload image for ${p.name}`} type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 size-full cursor-pointer opacity-0" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; void run(async () => {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP under 5 MB');
          const path = `${crypto.randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'}`;
          const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type });
          if (error) throw new Error('Image upload failed');
          try { await update(p, 'image_url', imagePrefix + path); } catch (error) { await supabase.storage.from('product-images').remove([path]); throw error; }
        }); }} /></label></td>
        <td className="p-1"><Cell label={`Name for ${p.name}`} value={p.name} save={value => run(() => update(p, 'name', value))} /></td>
        <td className="p-1"><select aria-label={`Category for ${p.name}`} className="h-10 w-full rounded border border-transparent bg-transparent px-2 text-sm focus:border-primary focus:bg-surface" value={p.category_id ?? ''} onChange={e => { if (e.target.value === 'new') { setNewCategory(p); setCategoryName(''); } else void run(() => update(p, 'category_id', e.target.value || null)); }}><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ Add category</option></select></td>
        <td className="p-1"><Cell label={`Unit for ${p.name}`} value={p.unit} save={v => run(() => update(p, 'unit', v))} /></td>
        <td className="p-1"><Cell label={`Price for ${p.name}`} value={String(p.price)} type="number" display={formatINR(p.price)} save={v => run(() => update(p, 'price', Number(v)))} /></td>
        <td className="px-2 py-3"><div className="flex items-center gap-1"><Button size="icon" variant="outline" className="size-8" title="Decrease stock by one" aria-label={`Decrease stock for ${p.name}`} disabled={!!saving || p.stock_quantity === 0} onClick={() => run(() => stock(p, -1, 'manual correction'))}><Minus /></Button><div className="w-20"><Cell label={`Stock for ${p.name}`} value={String(p.stock_quantity)} type="number" save={v => run(async () => { await stock(p, stockSchema.parse(v), 'manual correction', true); })} /></div><Button size="icon" variant="outline" className="size-8" title="Increase stock by one" aria-label={`Increase stock for ${p.name}`} disabled={!!saving} onClick={() => run(() => stock(p, 1, 'manual correction'))}><Plus /></Button></div><div className="mt-2 flex gap-1"><Button size="sm" variant="outline" disabled={!!saving || !p.stock_quantity} onClick={() => { setAdjust({product:p, reason:'offline sale'}); setQuantity('1'); }}>Sold offline</Button><Button size="sm" variant="outline" disabled={!!saving} onClick={() => { setAdjust({product:p, reason:'stock added'}); setQuantity('1'); }}><Plus />Add stock</Button></div></td>
        <td className="px-2 py-3"><span className={`text-xs font-semibold ${!p.stock_quantity ? 'text-destructive' : isLowStock(p.stock_quantity,p.low_stock_threshold) ? 'text-warning' : 'text-primary'}`}>{!p.stock_quantity ? 'Out of stock' : isLowStock(p.stock_quantity,p.low_stock_threshold) ? 'Low stock' : 'Available'}</span><div className="mt-1 flex items-center text-xs text-muted-foreground"><span>Alert below</span><div className="w-12"><Cell label={`Low stock threshold for ${p.name}`} value={String(p.low_stock_threshold)} type="number" save={v => run(() => update(p, 'low_stock_threshold', Number(v)))} /></div></div></td>
        <td className="px-2 py-3"><Button variant="ghost" size="sm" onClick={() => setHistory(p)}><History />History</Button><Button size="icon" variant="ghost" className="text-destructive" title="Delete product" aria-label={`Delete ${p.name}`} onClick={() => deleteProduct(p)}><Trash2 /></Button></td>
      </tr>)}</tbody></table>{!visible.length && <div className="py-14 text-center text-muted-foreground"><Package className="mx-auto mb-3 size-6" />No products found</div>}</div>
    <Dialog open={!!adjust} onOpenChange={open => { if (!open && !saving) setAdjust(null); }}><DialogContent><DialogHeader><DialogTitle>{adjust?.reason === 'offline sale' ? 'Sold offline' : 'Add stock'}</DialogTitle><DialogDescription>{adjust?.product.name} · {adjust?.product.stock_quantity} currently in stock</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); if (!adjust) return; const qty = Number(quantity); if (!Number.isInteger(qty) || qty <= 0) return void toast.error('Enter a positive whole quantity'); void run(async () => { await stock(adjust.product, adjust.reason === 'offline sale' ? -qty : qty, adjust.reason); setAdjust(null); }); }}><label className="block space-y-2 text-sm font-semibold">Quantity<Input aria-label="Adjustment quantity" autoFocus type="number" min="1" step="1" max={adjust?.reason === 'offline sale' ? adjust.product.stock_quantity : 100000000} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><Button disabled={!!saving} className="w-full">{saving ? 'Saving…' : 'Confirm stock change'}</Button></form></DialogContent></Dialog>
    <Dialog open={!!newCategory} onOpenChange={open => { if (!open && !saving) setNewCategory(null); }}><DialogContent><DialogHeader><DialogTitle>Add category</DialogTitle><DialogDescription>{newCategory?.name}</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => { if (!newCategory) return; const name=categoryName.trim(); if (!name || name.length>100) throw new Error('Enter a category name, up to 100 characters'); const {data,error}=await supabase.from('categories').insert({name,sort_order:categories.length}).select('id').single(); if (error || !data) throw new Error('Could not add category'); await update(newCategory,'category_id',data.id); setNewCategory(null); }); }}><Input aria-label="New category name" required autoFocus value={categoryName} onChange={e => setCategoryName(e.target.value)} /><Button disabled={!!saving}>Add category</Button></form></DialogContent></Dialog>
    <Dialog open={!!history} onOpenChange={open => { if (!open) setHistory(null); }}><DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle>Stock history</DialogTitle><DialogDescription>{history?.name}</DialogDescription></DialogHeader>{ledger.isPending ? <p>Loading history…</p> : ledger.isError ? <Button variant="outline" onClick={() => ledger.refetch()}>Retry history</Button> : !ledger.data?.length ? <p className="py-8 text-center text-sm text-muted-foreground">No stock changes yet.</p> : <div className="divide-y">{ledger.data.map(h => <div key={h.id} className="flex items-start justify-between gap-3 py-3 text-sm"><div><p className="font-semibold capitalize">{h.reason}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(new Date(h.created_at))}</p>{h.order_id && <p className="text-xs text-muted-foreground">Order #{h.order_id.slice(0,8).toUpperCase()}</p>}</div><div className="text-right"><p className={`font-bold tabular-nums ${h.quantity_change>0 ? 'text-primary' : 'text-destructive'}`}>{h.quantity_change>0 ? '+' : ''}{h.quantity_change}</p><p className="text-xs text-muted-foreground">{h.stock_after} remaining</p></div></div>)}</div>}</DialogContent></Dialog>
  </>;
}

function Cell({ value, label, save, type='text', display }: { value: string; label: string; save: (value:string) => Promise<boolean>; type?: string; display?: ReactNode }) {
  const [editing,setEditing]=useState(false); const [draft,setDraft]=useState(value); const [pending,setPending]=useState(false);
  async function commit() { if (pending) return; if(draft === value){setEditing(false);return;} setPending(true); const ok=await save(draft); setPending(false); if(ok)setEditing(false); }
  return editing ? <Input aria-label={label} autoFocus disabled={pending} className="h-10 min-w-0 rounded-sm bg-surface px-2 text-sm" type={type} min={type==='number' ? 0 : undefined} step={type==='number' ? 'any' : undefined} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>void commit()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();} if(e.key==='Escape'){setEditing(false);setDraft(value);}}} /> : <Button aria-label={label} variant="ghost" className="h-10 w-full justify-start overflow-hidden rounded-sm px-2 font-normal" onClick={()=>{setDraft(value);setEditing(true);}}><span className="truncate">{display ?? value}</span></Button>;
}