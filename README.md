# SOS Parsippany Parent and Client Form

Minimal Vercel form that stores parent name, client name, and separate server-generated `visit_date` and `visit_time` fields in Neon Postgres. Date and time use the `America/New_York` timezone for Parsippany.

Connect a Neon database from the Vercel Marketplace so the project receives `DATABASE_URL`. The `visit_submissions` table is created automatically on the first successful submission.

Names are not written to Vercel runtime logs.

The password-protected `/admin.html` page exports visits by date range and optional client-name search as an Excel-compatible CSV. Configure `ADMIN_PASSWORD` in Vercel environment variables; never hardcode or commit it.
