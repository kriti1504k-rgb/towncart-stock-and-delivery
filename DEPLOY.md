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
4. Optional but recommended: Authentication -> Sign In / Providers -> turn OFF "Allow new users to sign up".
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
