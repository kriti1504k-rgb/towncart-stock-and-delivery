import { Link } from "@tanstack/react-router";
import { Home, ShoppingCart, Package, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCart, formatINR } from "@/lib/cart";

export function AppShell({ children, title, hideCartBar }: { children: ReactNode; title?: string; hideCartBar?: boolean }) {
  const { count, total } = useCart();
  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-36">
      <header className="sticky top-0 z-20 border-b bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">
              W
            </span>
            <span className="truncate text-lg font-extrabold ">
              {title ?? "Wholesale Mart"}
            </span>
          </Link>

        </div>
      </header>
      <main>{children}</main>
      <div className="flex justify-center px-4 py-6"><Link to="/admin" className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="size-3" />Admin</Link></div>

      {!hideCartBar && count > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-3xl items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
        >
          <span className="text-sm font-semibold">
            {count} item{count > 1 ? "s" : ""} · {formatINR(total)}
          </span>
          <span className="flex items-center gap-1 text-sm font-bold">
            View cart <ShoppingCart className="h-4 w-4" />
          </span>
        </Link>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface">
        <div className="mx-auto grid max-w-3xl grid-cols-3">
          <NavItem to="/" icon={<Home className="h-5 w-5" />} label="Home" />
          <NavItem to="/cart" icon={<ShoppingCart className="h-5 w-5" />} label={`Cart${count ? ` (${count})` : ""}`} />
          <NavItem to="/orders" icon={<Package className="h-5 w-5" />} label="Orders" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: "/" | "/cart" | "/orders"; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-muted-foreground"
      activeProps={{ className: "text-primary" }}
    >
      {icon}
      {label}
    </Link>
  );
}
