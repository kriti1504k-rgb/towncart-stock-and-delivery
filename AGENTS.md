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

- Customers log in with phone + password; auth uses a derived private email (`phoneToAuthEmail` in src/lib/auth.tsx) because auth requires an email — never change the format or existing users can't log in.
- Customer rows are created by a DB trigger on signup from auth metadata (name, phone, contact_email, address).
- Orders are only created via the `place_order` DB function so prices come from the products table, not the browser.
- Cart lives in localStorage (src/lib/cart.tsx); products/categories are publicly readable, orders readable only by their owner.
