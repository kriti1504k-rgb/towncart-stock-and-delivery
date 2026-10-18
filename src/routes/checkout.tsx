import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useCart, formatINR } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Wholesale Mart" },
      { name: "description", content: "Confirm your delivery address and place your order. Pay cash or UPI on delivery." },
      { property: "og:title", content: "Checkout — Wholesale Mart" },
      { property: "og:description", content: "Place your order — pay on delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

function Checkout() {
  const { session, ready } = useAuth();
  const { lines, total, clear } = useCart();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: customer } = useQuery({
    queryKey: ["customer", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (customer && !address) setAddress(customer.address);
  }, [customer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !session) {
    return (
      <AppShell title="Checkout" hideCartBar>
        <div className="px-4 py-20 text-center">
          <p className="text-lg font-semibold">Please log in to place your order</p>
          <Link to="/auth" search={{ redirect: "/checkout" }} className="mt-4 inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">
            Login / Sign up
          </Link>
        </div>
      </AppShell>
    );
  }
  if (lines.length === 0) {
    return (
      <AppShell title="Checkout" hideCartBar>
        <p className="px-4 py-20 text-center text-muted-foreground">Your cart is empty.</p>
      </AppShell>
    );
  }

  async function placeOrder() {
    if (address.trim().length < 5) return toast.error("Please enter your delivery address");
    setBusy(true);
    const { error } = await supabase.rpc("place_order", {
      _address: address.trim().slice(0, 500),
      _note: note.trim().slice(0, 500),
      _items: lines.map((l) => ({ product_id: l.id, quantity: l.quantity })),
    });
    setBusy(false);
    if (error) return toast.error(error.message.includes("unavailable") ? "Some items are out of stock. Please update your cart." : "Could not place order. Please try again.");
    clear();
    qc.invalidateQueries({ queryKey: ["orders"] });
    toast.success("Order placed! We'll confirm it shortly.");
    navigate({ to: "/orders" });
  }

  const input = "w-full rounded-xl border bg-surface px-3 py-3 text-base outline-none focus:border-primary";
  return (
    <AppShell title="Checkout" hideCartBar>
      <div className="space-y-4 px-4 py-4">
        <section className="card-elevated space-y-2 p-4">
          <h2 className="font-bold">Delivery address</h2>
          <textarea rows={3} className={input} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
        </section>
        <section className="card-elevated space-y-2 p-4">
          <h2 className="font-bold">Note <span className="font-normal text-muted-foreground">(optional)</span></h2>
          <textarea rows={2} className={input} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
            placeholder="E.g. deliver after 4 pm" />
        </section>
        <section className="card-elevated space-y-2 p-4">
          <h2 className="font-bold">Order summary</h2>
          {lines.map((l) => (
            <div key={l.id} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{l.quantity} × {l.name}</span>
              <span className="shrink-0 font-semibold">{formatINR(l.price * l.quantity)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-lg font-extrabold">
            <span>Total</span><span>{formatINR(total)}</span>
          </div>
        </section>
        <section className="rounded-xl bg-secondary p-4 text-sm text-secondary-foreground">
          <p className="font-bold">Payment: Cash or UPI on delivery</p>
          <p>No online payment needed. Pay when your order arrives.</p>
        </section>
        <button onClick={placeOrder} disabled={busy}
          className="h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60">
          {busy ? "Placing order…" : `Place Order · ${formatINR(total)}`}
        </button>
      </div>
    </AppShell>
  );
}
