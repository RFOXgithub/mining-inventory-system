# StoneCrusher

Industrial operations system for an Indonesian aggregate and stone-crushing business.

## Fitur saat ini

- Responsive industrial application shell and executive operations dashboard
- Production monitoring with target, yield, downtime, and output composition
- Weighbridge transaction list and fast-entry workflow
- Database-backed stockpile capacity overview and central inventory ledger
- Atomic stockpile transfers with negative-stock, compatibility, and capacity validation
- Shared server-side Zod rules for weighbridge and production transactions
- Normalized PostgreSQL/Prisma foundation for RBAC, master data, inventory ledger, production, sales/delivery, approvals, notifications, audit logs, and document sequences
- Docker-ready PostgreSQL configuration

## Cara menjalankan (lokal)

1. Copy `.env.example` to `.env` and replace `AUTH_SECRET`.
2. Start PostgreSQL with `docker compose up -d`.
3. Run `npm install`.
4. Run `npm run db:generate` and `npx prisma migrate deploy`.
5. Start the application with `npm run dev`.

## Vercel deployment

- Use Node.js 20.x or 22.x.
- Configure `DATABASE_URL` as a server-only environment variable. On a
  serverless deployment, use the provider's pooled PostgreSQL URL with SSL.
- Configure a unique server-only `AUTH_SECRET` containing at least 32 random
  characters.
- Run `npx prisma migrate deploy` against the production database before the
  first release and whenever a new migration is added.
- The install and build scripts generate Prisma Client automatically; no custom
  Vercel output directory or `vercel.json` is required.

The current UI uses realistic demonstration data while the database-backed repository layer, sessions, and remaining phased modules are completed. Do not treat the demo transaction response as production persistence.

## Pengecekan kualitas

```sh
npm run typecheck
npm run build
npx prisma validate
```

## Akun uji (hanya development)

- Email: `admin@quarryflow.co.id`
- Password: `QuarryFlow2026!`

Ganti kredensial ini sebelum deploy ke production.
