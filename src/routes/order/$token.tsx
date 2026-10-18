import { createFileRoute, Link } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/cart';
import { trackingTokenSchema } from '@/lib/guest-checkout';
import { trackGuestOrder } from '@/lib/guest-order.functions';

const orderQuery = (token: string) => queryOptions({
  queryKey: ['private-order', token],
  queryFn: () => trackingTokenSchema.safeParse(token).success ? trackGuestOrder({ data: token }) : Promise.resolve(null),
  refetchInterval: 15000,
  staleTime: 0,
});

export const Route = createFileRoute('/order/$token')({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(orderQuery(params.token)),
  head: () => ({ meta: [
    { title: 'Order Confirmation & Status — Wholesale Mart' },
    { name: 'description', content: 'Private confirmation and delivery status for your Wholesale Mart order.' },
    { property: 'og:title', content: 'Order Status — Wholesale Mart' },
    { property: 'og:description', content: 'Private wholesale order confirmation and tracking.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  component: OrderConfirmation,
  errorComponent: ({ reset }) => <AppShell title="Order status" hideCartBar><div className="px-4 py-12 text-center"><p>Unable to load your order.</p><Button onClick={reset} className="mt-4"><RefreshCw />Try again</Button></div></AppShell>,
});

function OrderConfirmation() {
  const { token } = Route.useParams();
  const query = useSuspenseQuery(orderQuery(token));
  const order = query.data;
  if (!order) return <AppShell title="Order status" hideCartBar><div className="px-4 py-16 text-center"><h1 className="text-xl font-bold">Order link not found</h1><p className="mt-2 text-muted-foreground">Check that you opened the complete private order link.</p><Button asChild className="mt-5"><Link to="/">Back to shop</Link></Button></div></AppShell>;
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${window.location.origin}/order/${token}`); toast.success('Private order link copied'); }
    catch { toast.error('Could not copy. Save the address from your browser.'); }
  }
  return <AppShell title="Order confirmation" hideCartBar><div className="space-y-6 px-4 py-6">
    <div className="space-y-2 text-center"><CheckCircle2 className="mx-auto size-12 text-primary" /><h1 className="text-2xl font-extrabold">Order confirmed</h1><p className="text-sm text-muted-foreground">Order #{order.id.slice(0, 8).toUpperCase()}</p><p className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</p></div>
    <section className="flex items-center justify-between gap-3 border-y py-4"><div><h2 className="text-sm text-muted-foreground">Order status</h2><p className="mt-1 text-lg font-bold text-primary">{order.status}</p></div><Button variant="outline" size="icon" onClick={() => query.refetch()} disabled={query.isFetching} title="Refresh order status" aria-label="Refresh order status"><RefreshCw className={query.isFetching ? 'animate-spin' : ''} /></Button></section>
    <section className="space-y-3"><h2 className="font-bold">Your items</h2>{order.items.map(i => <div key={i.id} className="flex justify-between gap-3 text-sm"><div className="min-w-0"><p className="break-words font-semibold">{i.product_name}</p><p className="text-xs text-muted-foreground">{i.quantity} × {formatINR(Number(i.price))} · {i.unit}</p></div><span className="shrink-0 font-semibold">{formatINR(Number(i.price) * i.quantity)}</span></div>)}<div className="flex justify-between border-t pt-3 text-lg font-extrabold"><span>Total</span><span>{formatINR(Number(order.total))}</span></div></section>
    <section className="space-y-2 border-t pt-4"><h2 className="font-bold">Delivery</h2><p className="text-sm">{order.name}</p><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{order.delivery_address}</p>{order.note && <p className="break-words text-sm">Note: {order.note}</p>}<p className="text-sm font-semibold">Cash or UPI on delivery</p></section>
    <div className="space-y-3"><Button className="h-11 w-full" onClick={copyLink}><Copy />Copy private order link</Button><p className="text-center text-xs text-muted-foreground">Keep this link private. Anyone with it can view this order.</p><Button asChild variant="outline" className="h-11 w-full"><Link to="/">Continue shopping</Link></Button></div>
  </div></AppShell>;
}