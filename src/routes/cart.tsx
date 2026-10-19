import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { QtyControl } from "@/components/QtyControl";
import { useCart, formatINR } from "@/lib/cart";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Wholesale Mart" },
      { name: "description", content: "Review items and quantities before placing your wholesale order." },
      { property: "og:title", content: "Your Cart — Wholesale Mart" },
      { property: "og:description", content: "Review your wholesale order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, total, setQty, stock, stockReady, stockProblems } = useCart();
  return (
    <AppShell title="Cart" hideCartBar>
      {lines.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <p className="text-lg font-semibold">Your cart is empty</p>
          <Link to="/" className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
            Browse products
          </Link>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {stockReady && stockProblems.length > 0 && <p role="alert" className="text-sm text-destructive">Stock has changed. Reduce the highlighted quantities or remove unavailable items.</p>}
          {lines.map((l) => (
            <div key={l.id} className="card-elevated flex items-center gap-3 p-3">
              {l.image_url && <img src={l.image_url} alt={l.name} className="h-16 w-16 shrink-0 rounded-lg object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{l.name}</p>
                <p className="text-xs text-muted-foreground">{l.unit} · {formatINR(l.price)}</p>
                <p className="mt-1 text-sm font-bold">{formatINR(l.price * l.quantity)}</p>
                {stockReady && l.quantity > stock(l.id) && <p className="mt-1 text-xs font-semibold text-destructive">Only {stock(l.id)} available</p>}
              </div>
              <div className="flex w-28 shrink-0 flex-col items-end gap-2">
                <QtyControl product={l} />
                <button onClick={() => setQty(l, 0)} className="flex items-center gap-1 text-xs text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </div>
          ))}
          <div className="card-elevated flex items-center justify-between p-4">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-extrabold">{formatINR(total)}</span>
          </div>
          <Link to="/checkout" className="block h-12 rounded-xl bg-primary text-center text-base font-bold leading-[3rem] text-primary-foreground">
            Proceed to checkout
          </Link>
        </div>
      )}
    </AppShell>
  );
}
