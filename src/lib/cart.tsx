import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { allowedQuantity } from '@/lib/inventory';

export type CartProduct = { id: string; name: string; unit: string; price: number; image_url: string | null };
export type CartLine = CartProduct & { quantity: number };

type CartCtx = {
  lines: CartLine[];
  qty: (id: string) => number;
  setQty: (p: CartProduct, q: number) => void;
  clear: () => void;
  total: number;
  count: number;
  stock: (id: string) => number;
  stockReady: boolean;
  stockProblems: CartLine[];
};
const Ctx = createContext<CartCtx | null>(null);
const KEY = "wholesale-cart-v1";

export const formatINR = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const availability = useQuery({ queryKey: ['inventory-availability'], refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from('products').select('id, stock_quantity');
    if (error) throw error; return data;
  } });
  const stock = (id: string) => availability.data?.find(p => p.id === id)?.stock_quantity ?? 0;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(lines));
  }, [lines, loaded]);

  const setQty = (p: CartProduct, q: number) =>
    setLines((prev) => {
      const rest = prev.filter((l) => l.id !== p.id);
      if (q <= 0) return rest;
      const idx = prev.findIndex((l) => l.id === p.id);
      const quantity = allowedQuantity(q, stock(p.id));
      if (quantity === 0) return rest;
      const line = { ...p, quantity };
      if (idx === -1) return [...prev, line];
      const copy = [...prev];
      copy[idx] = line;
      return copy;
    });

  const value: CartCtx = {
    lines,
    qty: (id) => lines.find((l) => l.id === id)?.quantity ?? 0,
    setQty,
    clear: () => setLines([]),
    total: lines.reduce((s, l) => s + l.price * l.quantity, 0),
    count: lines.reduce((s, l) => s + l.quantity, 0),
    stock,
    stockReady: availability.isSuccess,
    stockProblems: lines.filter(l => l.quantity > stock(l.id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
