<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Admin phone/password login uses the existing `phoneToAuthEmail` derived email format; preserve it so existing admins can sign in. Public signup is disabled.
- Guest checkout details and private order links are stored only in browser localStorage for repeat visits; customer rows are upserted by phone inside the guest-order transaction.
- Guest orders are created through the service-only `place_guest_order` DB function after schema validation; the transaction validates stock and takes prices from the products table.
- Cart lives in localStorage (src/lib/cart.tsx); products/categories are publicly readable, direct order/customer/item reads are admin-only; guests read one order through `track_guest_order` using a random 256-bit capability whose hash is stored in a service-only table.
- Admin routes live under the client-only authenticated layout; admin server reads verify user_roles and mutations use the user-scoped client with RLS, never a privileged client, to enforce authorization on every request. Guest order creation is the sole public privileged operation and is restricted to the validating atomic DB function.
- First-admin reservations are service-only and matched to the actual derived auth email at signup, never to editable customer metadata, to prevent self-promotion.
- Uploaded catalogue images use private Storage object references and signed read URLs because workspace policy blocks public buckets.
- Catalogue and order changes invalidate queries through Realtime, with polling as a reconnection fallback.
- Inventory table lives in a separate InventoryTable component; stock quantities determine availability and CSV export stays browser-side.
- Stock mutations use row-locked database transactions and an immutable admin-readable stock ledger; order cancellation/restoration is triggered atomically, and legacy orders are excluded because they never deducted inventory.

- Order tracking lives at `/order/$token` with noindex, no-referrer, no-store responses and no contact-list projection; capabilities are never included in admin data queries.
