# QuarryFlow feature gap audit

Audit date: 18 September 2026. `COMPLETE` means UI, validation, persistence, authorization, integration, and tests—not merely a visible page.

| Area | State | Evidence / remaining work |
|---|---|---|
| Authentication | PARTIAL | Login, secure stateless session, protected routes, password hashing, and login audit exist. Rate limiting, CSRF strategy, user management, and session revocation remain. |
| Roles & Permissions | PARTIAL | Normalized schema, seed roles, permission claims, and API permission checks exist. Management UI and per-menu visibility remain. |
| Dashboard | PARTIAL | Core production, delivery, inventory, sales-order, weighbridge, vehicle, and notification KPIs now use database data. Invoice/procurement/asset KPIs depend on modules not yet modeled. |
| Settings | MISSING | Navigation only. |
| Products / Materials / Customers | PARTIAL | Customer create/update/deactivate API, validation, permission checks, audit, search, UI, and real order/delivery metrics exist. Product/material management remains. |
| Suppliers / Equipment / Spare Parts | MISSING | Navigation exists for some; no schema or implementation. |
| Vehicles / Drivers | BACKEND ONLY | Prisma models and seed data; no CRUD UI. |
| Weighbridge | PARTIAL | Authenticated create/list API, validation, atomic numbering, duplicate-active protection, audit, and connected entry form exist. Approval, stock effect, dynamic list page, cancellation, and dedicated ticket template remain. |
| Production | UI ONLY | Page and validation schema exist; data and buttons are hardcoded, with no persistence or inventory transaction. |
| Inventory / Stockpile | PARTIAL | Database-backed overview, stock card, master creation, atomic transfer, and approval-gated opname adjustment API exist with authorization, audit, validation, idempotency, and serializable DB transactions. Detail/opname UI and source-module postings remain. |
| Sales Order / Delivery | BACKEND ONLY | Partial schema only. Missing reservation rules, CRUD, state transitions, and product relation on delivery lines. |
| Quotations / Surat Jalan / Invoice / Payment | MISSING | No schema, APIs, or pages. |
| Procurement / Receiving | MISSING | No schema, APIs, or pages. |
| Maintenance / Scheduling / Spare usage | MISSING | No schema, APIs, or pages. |
| Approvals | BACKEND ONLY | Generic schema only; no policy/service/UI. |
| Notifications / Audit | PARTIAL | Database-backed viewers, filtering/detail comparison, unread/read/mark-all, and audit helpers exist. Automated notification generation remains incomplete. |
| Reports / Excel / CSV / PDF | MISSING | Dashboard buttons are dead. |
| Global Search | PARTIAL | Ctrl/Cmd+K search and API cover current customer, product, SO, DO, vehicle, driver, stockpile, and weighbridge records. Supplier/invoice/PR/PO/equipment indexes await those models. |

## Dead or misleading UI found

- Most sidebar links route to 404 pages.
- Dashboard download, alerts, notifications, and delivery drill-through are not implemented.
- Production create/filter/export controls have no handlers.
- Weighbridge list search/filter/export uses static data and has no handlers.
- User avatar, notification button, plant selector, and global search have no behavior.

## Dependency order

1. Finish authentication/RBAC hardening.
2. Finish weighbridge approval and incoming inventory integration.
3. Build inventory balance service and production completion transaction.
4. Complete sales reservation, delivery, outgoing weighbridge, and stock deduction.
5. Add invoicing/payment, then procurement and maintenance.
6. Replace dashboard/report mocks only after source transactions are real.
