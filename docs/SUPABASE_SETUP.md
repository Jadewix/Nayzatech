# Supabase setup

Everything to do in Supabase before any code runs. About 15 minutes.

---

## 1. Create the project

Supabase dashboard → **New project**.

Three settings, and two of them are permanent:

| Setting | What to enter |
|---|---|
| **Name** | Anything — `techstore` |
| **Database password** | Generate a strong one and **save it in your password manager now** |
| **Region** | The one closest to your customers |

**The region cannot be changed later.** Every query travels from your server to
this region and back, so a bad choice costs you latency on every page load
forever. Serving Lebanon and the wider region, `eu-central-1` (Frankfurt) is
normally the closest option. Moving later means creating a new project and
migrating the data by hand.

**The database password** is not the same as your API keys. You will not need it
for this project — the backend connects with an API key — but you need it if you
ever connect a SQL client directly, and Supabase will not show it to you again.

Wait for the project to finish provisioning (a minute or two).

---

## 2. Run the SQL, in order

Left sidebar → **SQL Editor** → **New query**.

Paste the contents of each file, click **Run**, wait for it to finish, then move
to the next. Order matters — later files depend on earlier ones.

| # | File | Creates |
|---|---|---|
| 1 | `backend/db/01_schema.sql` | Tables, the order lifecycle, `store_settings` |
| 2 | `backend/db/02_functions.sql` | Checkout, stock deduction, order transitions |
| 3 | `backend/db/03_security.sql` | Row Level Security + the image bucket |
| 4 | `backend/db/04_seed.sql` | 9 sample products |

> **Ignore `05_migrate_to_cod.sql`.** It converts an older prepaid database.
> You are starting fresh, so running it will only cause errors.

Each file is safe to re-run — every statement checks whether the thing already
exists. If the SQL Editor shows red errors, **read the first one only**. Errors
cascade, so everything after the first is usually noise.

### Confirm it worked

Left sidebar → **Table Editor**. You should see:

- `products` — 9 rows
- `categories` — 11 rows
- `orders`, `order_items`, `contact_submissions`, `inventory_movements` — empty
- `store_settings` — 4 rows

Left sidebar → **Storage**. You should see a bucket called **`product-images`**,
marked **Public**.

If the bucket is missing, `03_security.sql` did not run. Everything except image
uploads works without it, so you can carry on and fix it before adding photos.

---

## 3. Copy the two values the backend needs

Left sidebar → **Project Settings** (gear icon) → **API**.

**Project URL** — looks like `https://abcdefghijkl.supabase.co`

**service_role key** — a very long string, hidden behind a *Reveal* button.

### Getting this wrong wastes an evening

There are two keys on that page and they look almost identical:

| Key | What it does |
|---|---|
| `anon` | Safe to put in a browser. Row Level Security blocks nearly everything |
| `service_role` | Full read/write on every table. **This is the one you need** |

Pick the anon key by mistake and the server starts, product listings work, and
then every admin action fails with a permission error that points nowhere
useful. The backend checks which one you pasted and refuses to start if it is
wrong — but only if you paste it into the right variable.

**The service_role key is a master password for your database.** It goes in
`backend/.env` and nowhere else. Not in frontend code, not in a `NEXT_PUBLIC_*`
variable, not in a screenshot, not in a git commit. If it leaks, rotate it
immediately in this same settings page.

---

## 4. What you do NOT need to configure

Supabase does a lot of things this project does not use. You can ignore all of
these — no setup, no configuration:

- **Authentication** — admin access uses a shared key in the backend, not
  Supabase Auth. There are no customer accounts.
- **Edge Functions** — all logic runs in your Express server.
- **Realtime** — the storefront does not subscribe to live changes.
- **Database → Connection string** — the backend uses the Supabase client, not a
  direct Postgres connection, so you never need the connection pooler settings
  people usually struggle with.

The only Supabase features in play are the **database**, **Storage**, and the
**SQL Editor**.

---

## 5. Free tier: the one thing that will confuse you later

Free Supabase projects **pause after 7 days without activity**. A paused project
refuses all connections, so your backend will suddenly report
`Database FAILED` even though nothing in your code changed.

The fix takes ten seconds: open the Supabase dashboard and click **Restore**.

Worth knowing before it happens at an inconvenient moment. If you go a week
without working on this, expect it. Once you have real customers, a paid plan
removes the pausing.

Other free-tier limits, none of which you will approach while building:
500 MB database, 1 GB file storage, 5 GB bandwidth per month.

---

## Then

Back in the repo:

```bash
cd backend
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_API_KEY
npm install
npm run dev
```

You are looking for these two lines:

```
  Database    connected
  Storage     bucket "product-images" ready
```

Then open `http://localhost:5000/api/products` and confirm you see the seeded
product names. A server that boots is not the same as a server that works.

---

## When it goes wrong

**`Database FAILED — relation "categories" does not exist`**
The SQL did not run, or only partly ran. Re-run `01_schema.sql`.

**Server exits: `looks like the "anon" key, not "service_role"`**
Exactly what it says. Back to step 3.

**`Storage unavailable — bucket not found`**
`03_security.sql` did not run. Run it and restart the server.

**`Database FAILED` after a week away**
The project paused. Open the dashboard and click Restore.

**CORS error in the browser console (once the frontend is running)**
`FRONTEND_URL` in `backend/.env` does not match where Next.js is running.
Next uses port 3000; if yours picked a different one because 3000 was taken,
put that port in `FRONTEND_URL` and restart the backend.
