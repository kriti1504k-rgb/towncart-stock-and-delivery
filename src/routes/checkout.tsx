import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { useCart, formatINR } from '@/lib/cart';
import { detailsKey, emptyDetails, guestDetailsSchema, readSavedOrders, savedOrdersKey, type GuestDetails } from '@/lib/guest-checkout';
import { LocationPicker } from '@/components/LocationPicker';
import { placeGuestOrder } from '@/lib/guest-order.functions';

export const Route = createFileRoute('/checkout')({
  head: () => ({ meta: [
    { title: 'Guest Checkout — Wholesale Mart' },
    { name: 'description', content: 'Place your wholesale order without an account. Pay cash or UPI on delivery.' },
    { property: 'og:title', content: 'Guest Checkout — Wholesale Mart' },
    { property: 'og:description', content: 'Confirm your details and order with payment on delivery.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: Checkout,
});

function Checkout() {
  const { lines, total, clear, stockReady, stockProblems } = useCart();
  const navigate = useNavigate();
  const place = useServerFn(placeGuestOrder);
  const [details, setDetails] = useState<GuestDetails>(emptyDetails);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const stored = guestDetailsSchema.safeParse(JSON.parse(localStorage.getItem(detailsKey) ?? 'null'));
      if (stored.success) setDetails(stored.data);
    } catch { /* storage unavailable */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(detailsKey, JSON.stringify(details)); } catch { /* storage unavailable */ }
  }, [details, loaded]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!stockReady || stockProblems.length) return void toast.error('Stock has changed. Please update your cart.');
    const parsed = guestDetailsSchema.safeParse(details);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Check your details');
    setBusy(true);
    try {
      const result = await place({ data: { ...parsed.data, note, items: lines.map(l => ({ product_id: l.id, quantity: l.quantity })) } });
      try {
        localStorage.setItem(detailsKey, JSON.stringify(parsed.data));
        localStorage.setItem(savedOrdersKey, JSON.stringify([{ ...result, created_at: new Date().toISOString() }, ...readSavedOrders()].slice(0, 100)));
      } catch { /* storage unavailable */ }
      clear();
      await navigate({ to: '/order/$token', params: { token: result.token } });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not place order. Please try again.'); }
    finally { setBusy(false); }
  }
  if (!lines.length) return <AppShell title="Checkout" hideCartBar><div className="px-4 py-20 text-center"><p>Your cart is empty.</p><Button asChild className="mt-4"><Link to="/">Browse products</Link></Button></div></AppShell>;
  const input = 'w-full rounded-lg border bg-surface px-3 py-3 text-base outline-none focus:border-primary';
  return <AppShell title="Checkout" hideCartBar>
    <form onSubmit={submit} className="space-y-5 px-4 py-5">
      <h1 className="text-xl font-extrabold">Delivery details</h1>
      {stockReady && stockProblems.length > 0 && <p role="alert" className="text-sm text-destructive">Stock has changed. <Link to="/cart" className="underline">Update your cart</Link> before placing this order.</p>}
      <label className="block space-y-1 text-sm font-semibold"><span>Name *</span><input required maxLength={100} autoComplete="name" className={input} value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></label>
      <label className="block space-y-1 text-sm font-semibold"><span>Phone number *</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input required pattern="[0-9]{10}" inputMode="numeric" maxLength={10} autoComplete="tel-national" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value.replace(/\D/g, '') })} /></div></label>
      <label className="block space-y-1 text-sm font-semibold"><span>Alternate phone number (optional)</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input pattern="[0-9]{10}" inputMode="numeric" maxLength={10} autoComplete="off" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={details.alt_phone} onChange={e => setDetails({ ...details, alt_phone: e.target.value.replace(/\D/g, '') })} /></div></label>
      <label className="block space-y-1 text-sm font-semibold"><span>Email (optional)</span><input type="email" maxLength={255} autoComplete="email" className={input} value={details.email} onChange={e => setDetails({ ...details, email: e.target.value })} /></label>
      <label className="block space-y-1 text-sm font-semibold"><span>Delivery address *</span><textarea required minLength={5} maxLength={500} rows={3} autoComplete="street-address" className={input} value={details.address} onChange={e => setDetails({ ...details, address: e.target.value })} placeholder="Shop name, street, landmark, town" /></label>
      <section className="space-y-2"><h2 className="text-sm font-semibold">Pin your location on the map <span className="font-normal text-muted-foreground">(recommended)</span></h2><p className="text-xs text-muted-foreground">Helps the delivery person find you quickly. You can skip this.</p><LocationPicker lat={details.lat} lng={details.lng} onChange={(lat, lng) => setDetails(d => ({ ...d, lat, lng }))} /></section>
      <label className="block space-y-1 text-sm font-semibold"><span>Note (optional)</span><textarea rows={2} maxLength={500} className={input} value={note} onChange={e => setNote(e.target.value)} /></label>
      <section className="space-y-2 border-y py-4"><h2 className="font-bold">Order summary</h2>{lines.map(l => <div key={l.id} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{l.quantity} × {l.name}</span><span className="shrink-0 font-semibold">{formatINR(l.price * l.quantity)}</span></div>)}<div className="flex justify-between border-t pt-3 text-lg font-extrabold"><span>Total</span><span>{formatINR(total)}</span></div></section>
      <p className="rounded-lg bg-secondary p-4 text-sm font-semibold text-secondary-foreground">Payment: Cash or UPI on delivery</p>
      <Button type="submit" disabled={busy || !loaded || !stockReady || !!stockProblems.length} className="h-12 w-full text-base font-bold">{busy ? 'Placing order…' : `Place Order · ${formatINR(total)}`}</Button>
    </form>
  </AppShell>;
}
