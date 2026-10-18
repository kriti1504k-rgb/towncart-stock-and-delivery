import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartProduct = { id: string; name: string; unit: string; price: number; image_url: string | null };
export type CartLine = CartProduct & { quantity: number };

type CartCtx = {
  lines: CartLine[];
  qty: (id: string) => number;
  setQty: (p: CartProduct, q: number) => void;
  clear: () => void;
  total: number;
  count: number;
};
const Ctx = createContext<CartCtx | null>(null);
const KEY = "wholesale-cart-v1";

export const formatINR = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
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
      const line = { ...p, quantity: Math.min(q, 9999) };
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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}
