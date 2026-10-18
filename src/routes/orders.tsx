import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { readSavedOrders, type SavedOrder } from '@/lib/guest-checkout';

export const Route = createFileRoute('/orders')({
  head: () => ({ meta: [
    { title: 'Saved Orders — Wholesale Mart' },
    { name: 'description', content: 'Open private order links saved on this device.' },
    { property: 'og:title', content: 'Saved Orders — Wholesale Mart' },
    { property: 'og:description', content: 'Your locally saved wholesale order links.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: Orders,
});
function Orders() {
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => { setOrders(readSavedOrders()); setReady(true); }, []);
  return <AppShell title="Orders"><div className="space-y-3 px-4 py-5"><h1 className="text-xl font-extrabold">Your orders</h1>
    {ready && !orders.length && <p className="py-12 text-center text-muted-foreground">No orders saved on this device.</p>}
    {orders.map(o => <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border bg-surface p-4"><div><p className="font-bold">Order #{o.id.slice(0, 8).toUpperCase()}</p><p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-IN')}</p></div><Button asChild variant="outline"><Link to="/order/$token" params={{ token: o.token }}>View order</Link></Button></div>)}
  </div></AppShell>;
}
