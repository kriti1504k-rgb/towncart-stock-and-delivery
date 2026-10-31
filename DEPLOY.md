# Putting TownCart online (without Lovable)

Everything below is done in the Chrome browser. No software to install.
Hosting: **Cloudflare** (free plan is enough to start). Database: **Supabase**.

---------------------------------------------------------------------

## PART A. Where is your database? (check this first)

1. Open https://supabase.com/dashboard and log in with the account you made.
2. Look for a project whose address contains **kpzslefwtbovgjbugfpt**.

**A1. You SEE that project** -> it is your own database. Go to Part B.

**A2. You do NOT see it** -> it is held by Lovable Cloud, and you cannot get its secret key.
Make a fresh database of your own (about 15 minutes). Nothing real is lost: it only holds test data.
1. Supabase -> New project. Name: `towncart`. Region: Mumbai (ap-south-1). Save the database password somewhere safe.
2. Left menu -> SQL Editor -> New query. Open the file `supabase-setup.sql` from this folder, copy everything, paste, click Run. It should say "Success".
3. Create the admin (also described at the bottom of `supabase-setup.sql`):
   - Authentication -> Users -> Add user -> Create new user
   - Email: `p` + 10-digit admin phone + `@phone.local`  (example: `p9876543210@phone.local`)
   - Password: a strong one. Tick **Auto Confirm User**. Create.
   - SQL Editor -> run (use the same email):
     INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = 'p9876543210@phone.local';
4. Customer accounts need these two Supabase settings (Authentication -> Sign In / Providers):
   - "Allow new users to sign up": keep it ON (customers create their own accounts).
   - Email provider -> "Confirm email": turn it OFF. Customer logins use a private phone-based address, so nobody can click a confirmation email.
   Then run `supabase-update-0008.sql` once in the SQL Editor (it is safe to run again).
5. Open the file `.env` in your GitHub repo (pencil icon) and replace the 6 lines with the new project's values (Supabase -> Project Settings -> API / General):
   SUPABASE_PROJECT_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and the same three again with the VITE_ prefix. Commit.
   (These three are public-safe values. Never put the secret key in this file.)

---------------------------------------------------------------------

## PART B. Put the new code on GitHub

1. Open your repo on github.com. Use a laptop-style view (Chrome menu -> Desktop site if on phone).
2. Click **Add file -> Upload files**.
3. Drag the contents of this folder (the files AND the `src` folder) into the page. GitHub keeps the folder structure.
4. Write a message like "Hindi/English switch, Cloudflare hosting" and click **Commit changes**.

---------------------------------------------------------------------

## PART C. Publish on Cloudflare

1. Create a free account at https://dash.cloudflare.com
2. **Workers & Pages -> Create -> Import a repository** (or "Connect to Git"). Connect GitHub, allow access to this ONE repository, select it.
3. Settings on the setup page:
   - Project / Worker name: `towncart` (must be exactly this)
   - Build command: `bun run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: leave blank
4. Click **Save and Deploy**. Wait for the build to finish. If it fails, copy the red error text and send it to Claude.
5. Open the worker -> **Settings -> Variables and Secrets -> Add**:

   | Name                       | Type     | Value                                             |
   |----------------------------|----------|---------------------------------------------------|
   | SUPABASE_URL               | Text     | your Supabase project URL                         |
   | SUPABASE_PUBLISHABLE_KEY   | Text     | the "anon" / publishable key                      |
   | SUPABASE_SERVICE_ROLE_KEY  | **Secret** | the "service_role" / secret key                 |

   Find them in Supabase -> Project Settings -> API (or "API Keys").
   **The service_role / secret key is a master key. Paste it only into Cloudflare as a Secret. Never into GitHub, chat, or WhatsApp.**
6. Click **Deploy** again (Deployments -> Retry / or make any small commit). Your site is now live at `https://towncart.<your-name>.workers.dev`.
7. Later: Settings -> Domains & Routes -> add the client's own domain.

From now on, every change you commit to GitHub is published automatically in about a minute.

---------------------------------------------------------------------

## PART D. Check that everything works

1. Open the site address on your phone. Products show up.
2. Open `/auth`, log in as admin. Open `/admin`.
3. Tap the language button (हिंदी / English) at the top. The screens change language, and it is remembered.
4. In Products, add stock to one item. Order it from a different browser (incognito). Stock drops. Cancel the order: stock comes back.
5. Sell some at the counter ("Sold offline"): stock drops. At zero, customers see "Out of stock".

NOTE: new products start with 0 stock, so the shop looks empty until you enter real stock quantities.

---------------------------------------------------------------------

## PART E. Customer accounts and the customer database

- Customers can create an account (name, phone, password, address, map pin) or order as a guest.
- All customers, with or without accounts, are stored in ONE table: Supabase -> Table Editor -> `customers`.
  The `maps_link` column is a clickable Google Maps link. You can export the table as CSV from the Table Editor.
- In the admin panel: Customers tab -> search, open map links, WhatsApp, "Reset password" for account holders,
  and CSV downloads (all customers, or only those who agreed to offers).
- Only message customers who ticked the offers box (the "Agreed to offers" column).
- Forgot-password: the customer contacts the shop, you set a temporary password in the Customers tab.
  To show a WhatsApp button on the login page, put the shop number in `src/lib/shop-config.ts`.
- Back up regularly: download the customers CSV every week or two.
