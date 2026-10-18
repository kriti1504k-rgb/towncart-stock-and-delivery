import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { formatINR } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — Wholesale Mart" },
      { name: "description", content: "Track the status of your wholesale orders." },
      { property: "og:title", content: "My Orders — Wholesale Mart" },
      { property: "og:description", content: "Track your orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

const statusStyle: Record<string, string> = {
  Received: "bg-muted text-foreground",
  Confirmed: "bg-accent text-accent-foreground",
  Dispatched: "bg-secondary text-secondary-foreground",
  Delivered: "bg-primary text-primary-foreground",
  Cancelled: "bg-destructive text-destructive-foreground",
};

function Orders() {
  const { session, ready } = useAuth();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="My Orders">
      {ready && !session ? (
        <div className="px-4 py-20 text-center">
          <p className="text-lg font-semibold">Log in to see your orders</p>
          <Link to="/auth" search={{ redirect: "/orders" }} className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
            Login
          </Link>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {isLoading && <div className="h-28 animate-pulse rounded-xl bg-muted" />}
          {!isLoading && orders.length === 0 && (
            <p className="py-16 text-center text-muted-foreground">No orders yet.</p>
          )}
          {orders.map((o) => (
            <div key={o.id} className="card-elevated p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">Order #{o.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusStyle[o.status]}`}>{o.status}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {o.order_items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{i.quantity} × {i.product_name} <span className="text-muted-foreground">({i.unit})</span></span>
                    <span className="shrink-0">{formatINR(Number(i.price) * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t pt-2 font-extrabold">
                <span>Total</span><span>{formatINR(Number(o.total))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
