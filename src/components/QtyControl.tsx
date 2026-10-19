import { Minus, Plus } from "lucide-react";
import { useCart, type CartProduct } from "@/lib/cart";
import { Button } from '@/components/ui/button';

export function QtyControl({ product, size = "sm" }: { product: CartProduct; size?: "sm" | "md" }) {
  const { qty, setQty, stock, stockReady } = useCart();
  const available = stock(product.id);
  const q = qty(product.id);
  const h = size === "md" ? "h-10" : "h-9";
  if (q === 0) {
    return (
      <Button variant="outline" disabled={!stockReady || available === 0}
        onClick={() => setQty(product, 1)}
        className={`${h} w-full rounded-lg border-2 border-primary bg-surface text-sm font-bold text-primary transition active:scale-95`}
      >
        {stockReady && available === 0 ? 'Out of stock' : 'ADD'}
      </Button>
    );
  }
  return (
    <div className={`${h} flex w-full items-center justify-between rounded-lg bg-primary text-primary-foreground`}>
      <Button variant="ghost" size="icon" aria-label="Decrease" onClick={() => setQty(product, q - 1)} className="h-full w-9 text-primary-foreground">
        <Minus className="h-4 w-4" />
      </Button>
      <span className="text-sm font-bold tabular-nums">{q}</span>
      <Button variant="ghost" size="icon" aria-label="Increase" disabled={!stockReady || q >= available} onClick={() => setQty(product, q + 1)} className="h-full w-9 text-primary-foreground">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
