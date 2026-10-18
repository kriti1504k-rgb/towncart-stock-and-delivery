import { Minus, Plus } from "lucide-react";
import { useCart, type CartProduct } from "@/lib/cart";

export function QtyControl({ product, size = "sm" }: { product: CartProduct; size?: "sm" | "md" }) {
  const { qty, setQty } = useCart();
  const q = qty(product.id);
  const h = size === "md" ? "h-10" : "h-9";
  if (q === 0) {
    return (
      <button
        onClick={() => setQty(product, 1)}
        className={`${h} w-full rounded-lg border-2 border-primary bg-surface text-sm font-bold text-primary transition active:scale-95`}
      >
        ADD
      </button>
    );
  }
  return (
    <div className={`${h} flex w-full items-center justify-between rounded-lg bg-primary text-primary-foreground`}>
      <button aria-label="Decrease" onClick={() => setQty(product, q - 1)} className="grid h-full w-9 place-items-center">
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-sm font-bold tabular-nums">{q}</span>
      <button aria-label="Increase" onClick={() => setQty(product, q + 1)} className="grid h-full w-9 place-items-center">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
