import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { QtyControl } from "@/components/QtyControl";
import { formatINR } from "@/lib/cart";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Wholesale Mart — Order groceries in bulk" },
      { name: "description", content: "Order rice, atta, oil, dal, spices and more at wholesale prices. Cash or UPI on delivery." },
      { property: "og:title", content: "Wholesale Mart — Order groceries in bulk" },
      { property: "og:description", content: "Wholesale prices, delivered in town. Cash or UPI on delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter(
      (p) => (!cat || p.category_id === cat) && (!s || p.name.toLowerCase().includes(s)),
    );
  }, [products, q, cat]);

  return (
    <AppShell>
      <div className="sticky top-[61px] z-10 bg-background px-4 pb-2 pt-3">
        <label className="flex items-center gap-2 rounded-xl border bg-surface px-3 py-2.5 shadow-sm focus-within:border-primary">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search atta, rice, oil…"
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip active={!cat} onClick={() => setCat(null)}>All</Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-2 sm:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}
        {filtered.map((p) => {
          const product = { id: p.id, name: p.name, unit: p.unit, price: Number(p.price), image_url: p.image_url };
          return (
            <div key={p.id} className="card-elevated flex flex-col overflow-hidden">
              <div className="relative aspect-square bg-surface p-2">
                {p.image_url && (
                  <img src={p.image_url} alt={p.name} loading="lazy" width={512} height={512}
                    className={`h-full w-full object-contain ${p.in_stock ? "" : "opacity-40 grayscale"}`} />
                )}
                {!p.in_stock && (
                  <span className="absolute left-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                    Out of stock
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3 pt-1">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</h3>
                <p className="text-xs text-muted-foreground">{p.unit}</p>
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <span className="text-base font-extrabold">{formatINR(Number(p.price))}</span>
                  {p.in_stock ? (
                    <QtyControl product={product} />
                  ) : (
                    <div className="grid h-9 place-items-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                      Out of stock
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!isLoading && filtered.length === 0 && (
        <p className="px-4 py-16 text-center text-muted-foreground">No products found.</p>
      )}
    </AppShell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
        active ? "border-primary bg-primary text-primary-foreground" : "bg-surface text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
