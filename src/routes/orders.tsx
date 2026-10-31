import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { ChevronRight, MapPin, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { AccountView } from '@/components/AccountView';
import { AppShell } from '@/components/AppShell';
import { CustomerAuthCard } from '@/components/CustomerAuthCard';
import { LocationPicker } from '@/components/LocationPicker';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/cart';
import { useCustomerSession } from '@/lib/customer-auth';
import { detailsKey, emptyDetails, guestDetailsSchema, mapLink, readSavedOrders, type GuestDetails, type SavedOrder } from '@/lib/guest-checkout';
import { trackGuestOrder } from '@/lib/guest-order.functions';

export const Route = createFileRoute('/orders')({
  head: () => ({ meta: [
    { title: 'My Profile & Orders — Wholesale Mart' },
    { name: 'description', content: 'Your account, delivery address and orders.' },
    { property: 'og:title', content: 'My Profile & Orders — Wholesale Mart' },
    { property: 'og:description', content: 'Your account and orders.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: Profile,
});

function Profile() {
  const { session, ready } = useCustomerSession();
  return <AppShell title="My profile"><div className="space-y-6 px-4 py-5">
    {!ready ? <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p> : session ? <AccountView session={session} /> : <><CustomerAuthCard /><GuestSections /></>}
  </div></AppShell>;
}

type Info = { status: string; total: number } | 'error';
const finished = (status: string) => status === 'Delivered' || status === 'Cancelled';
const input = 'w-full rounded-lg border bg-surface px-3 py-3 text-base outline-none focus:border-primary';

// Details and orders saved on this phone, for people ordering without an account.
function GuestSections() {
  const track = useServerFn(trackGuestOrder);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<GuestDetails | null>(null);
  const [draft, setDraft] = useState<GuestDetails>(emptyDetails);
  const [editing, setEditing] = useState(false);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [info, setInfo] = useState<Record<string, Info>>({});

  useEffect(() => {
    let stored: GuestDetails | null = null;
    try { const r = guestDetailsSchema.safeParse(JSON.parse(localStorage.getItem(detailsKey) ?? 'null')); if (r.success) stored = r.data; } catch { /* storage unavailable */ }
    setSaved(stored); setDraft(stored ?? emptyDetails); setEditing(false);
    const list = readSavedOrders();
    setOrders(list); setReady(true);
    list.slice(0, 30).forEach(o => {
      track({ data: o.token })
        .then(r => setInfo(prev => ({ ...prev, [o.id]: r ? { status: r.status, total: Number(r.total) } : 'error' })))
        .catch(() => setInfo(prev => ({ ...prev, [o.id]: 'error' })));
    });
  }, [track]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = guestDetailsSchema.safeParse(draft);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Check your details');
    try { localStorage.setItem(detailsKey, JSON.stringify(parsed.data)); } catch { return void toast.error('Could not save on this device.'); }
    setSaved(parsed.data); setDraft(parsed.data); setEditing(false);
    toast.success('Details saved. They will be filled in at checkout.');
  }

  const current = orders.filter(o => { const i = info[o.id]; return !i || (i !== 'error' && !finished(i.status)); });
  const history = orders.filter(o => { const i = info[o.id]; return i && i !== 'error' && finished(i.status); });
  const row = (o: SavedOrder) => {
    const i = info[o.id];
    return <Link key={o.id} to="/order/$token" params={{ token: o.token }} className="flex items-center justify-between gap-3 rounded-lg border bg-surface p-4">
      <div className="min-w-0"><p className="font-bold">Order #{o.id.slice(0, 8).toUpperCase()}</p><p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-IN')}{i && i !== 'error' ? ` · ${formatINR(i.total)}` : ''}</p></div>
      <div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{!i ? 'Loading…' : i === 'error' ? 'Open' : i.status}</span><ChevronRight className="size-4 text-muted-foreground" /></div>
    </Link>;
  };
  if (!ready || (!saved && !orders.length)) return null;

  return <>
    <h2 className="pt-2 text-lg font-extrabold">Saved on this phone</h2>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">My details</h3>{saved && !editing && <Button variant="outline" size="sm" onClick={() => { setDraft(saved); setEditing(true); }}><Pencil />Edit</Button>}</div>
      {editing ? <form onSubmit={save} className="space-y-4 rounded-lg border bg-surface p-4">
        <label className="block space-y-1 text-sm font-semibold"><span>Name *</span><input required maxLength={100} autoComplete="name" className={input} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Phone number *</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input required pattern="[0-9]{10}" inputMode="numeric" maxLength={10} autoComplete="tel-national" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value.replace(/\D/g, '') })} /></div></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Alternate phone number (optional)</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input pattern="[0-9]{10}" inputMode="numeric" maxLength={10} autoComplete="off" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={draft.alt_phone} onChange={e => setDraft({ ...draft, alt_phone: e.target.value.replace(/\D/g, '') })} /></div></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Email (optional)</span><input type="email" maxLength={255} autoComplete="email" className={input} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Delivery address *</span><textarea required minLength={5} maxLength={500} rows={3} autoComplete="street-address" className={input} value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></label>
        <div className="space-y-2"><h4 className="text-sm font-semibold">Location on map</h4><LocationPicker lat={draft.lat} lng={draft.lng} onChange={(lat, lng) => setDraft(d => ({ ...d, lat, lng }))} /></div>
        <div className="flex gap-2"><Button type="submit" className="flex-1">Save details</Button><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form> : saved && <div className="space-y-2 rounded-lg border bg-surface p-4 text-sm">
        <p className="text-base font-bold">{saved.name}</p><p>+91 {saved.phone}</p>
        {saved.alt_phone && <p className="text-muted-foreground">Alternate: +91 {saved.alt_phone}</p>}
        {saved.email && <p className="break-words text-muted-foreground">{saved.email}</p>}
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{saved.address}</p>
        {saved.lat !== null && saved.lng !== null && <a href={mapLink(saved.lat, saved.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary"><MapPin className="size-4" />Location pinned · View on map</a>}
      </div>}
    </section>
    {!!current.length && <section className="space-y-3"><h3 className="font-bold">Current orders</h3>{current.map(row)}</section>}
    {!!history.length && <section className="space-y-3"><h3 className="font-bold">Order history</h3>{history.map(row)}</section>}
    <p className="text-xs text-muted-foreground">Without an account, details and orders are kept on this phone only. Create an account to see them on any phone.</p>
  </>;
}
