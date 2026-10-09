# Gap matrix QuarryFlow → Project Control PT AJA

## Pembaruan Tahap 2 dan audit — 3 Oktober 2026

Status berikut menggantikan backlog Complete/PWA inspeksi pada sesi historis. Audit memakai Acuan, matrix ini, PAGE-PLAN dan PROGRESS; tidak mengaktifkan CR atau mempromosikan data perusahaan.

| Gap | Implementasi / perbaikan audit | Gate tersisa |
| --- | --- | --- |
| G22 dokumen/file/surat | `/documents` composer/preview, source bundle scoped/snapshot, register/filter/history, verified numbering/concurrent issue/cancel never reuse; private binary file + download ACL sebelum fetch | Kode/deret OPEN-20; S3/retention, inline attachment Core/timbang; parameter dan UAT perusahaan |
| G23 equipment/aset/pekerja | Fisik dan parameter keuangan terpisah; verified version, rental gate, satu asset-period, peer Finance, posting/signed correction Manager; historical book/export dari signed events; worker version | Master/ownership OPEN-18, parameter/opening OPEN-19; legacy mapping dan sign-off |
| G24 HSE/medis | Checklist aktual, finding/PIC/target/foto, peer follow-up, worker summary; WCU/DCU private table/ACL; nilai/file klinis tidak public query/audit/export/offline | Privacy/retention, HSE UAT dan perangkat lapangan OPEN-22 |
| G25 staging/migration | Trial stock/fuel read-only dengan source checksum/lineage/mapping/exception, deterministic UUID, NEW_OPENING vs EXISTING_BRIDGE; anti double-opening dan restore fixture; SOP/cutoff/rollback/UAT | Workbook asli, adapter AR/PO/HSE, real rehearsal/mapping/reconciliation; PC + Finance berbeda + Manager sign-off; production belum diizinkan |
| G28 PWA | Inspeksi menambah draft device existing; runtime schema menolak medical, minimal references, auth generation guard, version conflict tanpa overwrite; cache lease + CLEAR acknowledgement mencegah background preparation mengisi shell kembali setelah logout | Retest reload/sync/logout final dicatat PROGRESS; UAT perangkat/HTTPS/shared-device/expiry production |
| G18/G19/G21/G33 audit/testing | Depreciation pending/correction masuk closing; canonical JSON hash mencegah false retry conflict; serializable retry menangani numbering concurrence; finance bundle retry tidak membocorkan source setelah permission dicabut; report/file/restore/trial acceptance | Tests otomatis tidak menggantikan UAT; monitoring/restore target RPO/RTO, ADR stack, export XLSX/PDF/integrasi belum disahkan |

Evidence: [Stage2 services](../../src/features/stage2/documents.ts), [depreciation](../../src/features/stage2/depreciation.ts), [signed correction](../../src/features/stage2/depreciation-correction.ts), [query/ACL](../../src/features/stage2/query.ts), [private files](../../src/features/stage2/files.ts), [migration](../../prisma/migrations/202610030004_stage2/migration.sql), [tests](../../tests/stage2.integration.test.ts), [staging trial](../../src/features/inventory/staging-trial.ts), [SOP/UAT/cut-over](STAGING-UAT-CUTOVER.md). Hasil final dan kesiapan Core/Complete ada di [PROGRESS](PROGRESS.md).

Tanggal audit W0: 2 Oktober 2026; pembaruan inventory/produksi/komersial/keuangan: 3 Oktober 2026. Commit sumber W0: `b315e70`. Tabel baseline merekam W0; pembaruan sesi berikut memperbarui status tanpa menghapus temuan historis. Migration additive S1/inventory/produksi/komersial/keuangan belum diterapkan ke database aplikasi.

## Pembaruan Core — PROMPT.md terbaru

Status ini menggantikan backlog Core pada catatan sesi sebelumnya; tabel W0 di bawah tetap evidence historis.

| Gap | Implementasi terbaru | Gate tersisa |
| --- | --- | --- |
| G18/G19 approval/periode | `/approvals` source inbox/review before-after/reason/history, domain/version/hash/permission/maker guard; tab closing readiness/blocker/checklist resmi, Finance fingerprint, Manager close/reopen; carryover DO dan timeline negatif diperiksa | Kebijakan exception tambahan perusahaan, UAT/restore/live activation; migration staging bukan bagian worklist transaksi |
| G21 dashboard/report/export | Dashboard per role/plant dan 12 report inti membaca immutable/signed source yang sama; event/UOM/currency terpisah, as-of WIB, source drill-down; CSV server totals/KPI/IDs/actor/status, snapshot parity dan audit | XLSX/PDF, tujuan integrasi akuntansi, workbook 21 sheet yang belum diberikan, report Tahap Complete |
| G28 PWA | Draft produksi/BBM di IndexedDB owner/device/UUID/revision/status; public asset/shell worker, offline read/create saja; revalidation/dedup/conflict, source/tujuan period guard, logout/revocation cleanup | UAT browser/perangkat/HTTPS production, inspeksi setelah domain Complete tersedia |
| G03/G26/G27/G33 kontrol/UI/tests | Scope/grant/role ceiling sebelum query/export; 3 halaman utama dengan state dan responsive; 30 unit + 34 backend/browser PASS, evidence di PROGRESS | Grant Core eksplisit, parameter owner/sign-off, migration aplikasi/UAT/operational monitoring |

Evidence: [approval](../../src/features/core/approvals.ts), [closing](../../src/features/core/closing.ts), [official reports](../../src/features/core/reports.ts), [Core workspace](../../src/components/core-workspace.tsx), [offline drafts](../../src/lib/offline-drafts.ts), [worker](../../public/draft-worker.js), [sync service](../../src/features/operations/sync.ts), [Core unit](../../tests/core.test.ts), [production/Core/Chrome tests](../../tests/operations.integration.test.ts), [financial report tests](../../tests/finance.integration.test.ts).

## Pembaruan keuangan — sesi sebelumnya

| Gap | Implementasi tiga halaman | Gate tersisa |
| --- | --- | --- |
| G17 invoice/AR | `/invoices` composer completed/accepted/proof, source quantity/freight anti double-billing termasuk backdate setelah cancellation; harga/tax/term snapshot; Finance issue normal; due-date kalender | Term/tax perusahaan OPEN-07/21; AR legacy belum dipromosikan; upload/export resmi |
| G20 receipt/PPh/aging | `/payments` actual receipt/rekening verified, allocation multi-invoice customer/currency/plant sama, unallocated, PPh actual peer verified, signed correction; `/receivables` rekonsiliasi/aging as-of/drill-down | Rekening OPEN-09; certificate satu invoice, tanpa split certificate; legacy settlement membutuhkan rekonsiliasi owner |
| G18/G19 approval/periode | Manager correction berbeda maker/pengesah source; dependency settlement; original/correction period guard; shared lock, dated balance guard; pending finance/events masuk close fingerprint | Worklist/closing seluruh modul dan official checklist generik belum selesai |
| G26/G27/G31 audit/UI/tests | Append-only source/event, idempotency/version, audit; invoice composer, allocation dua panel, rekonsiliasi/aging; checks nyata di PROGRESS | Migration/UAT/restore/activation perusahaan; dashboard/report lama belum query ledger resmi |

Evidence: [finance service](../../src/features/finance/service.ts), [read model](../../src/features/finance/query.ts), [workspace](../../src/components/finance-workspace.tsx), [calculation tests](../../tests/finance.test.ts), [integration/Chrome](../../tests/finance.integration.test.ts), [migration](../../prisma/migrations/202610030003_finance_ledger/migration.sql). Formula baru tidak mengurangi header receipt dari outstanding; model Invoice/Payment lama tetap arsip, tanpa opening AR kedua otomatis.

## Pembaruan komersial / Customer PO / delivery — instruksi lanjutan pengguna

| Gap | Implementasi paket tiga halaman | Gate tersisa |
| --- | --- | --- |
| G07 quotation/SO/harga | `/sales-orders` composer quotation/SPH opsional, SO tunai tanpa PO atau kontrak/kredit dengan PO; barang/jasa, customer/proyek/term, immutable price/tax/freight snapshot; deviasi meminta Manager; minimum order verified | Parameter harga asli/kontrak/minimum/pajak/term; mapping customer/project legacy; live migration/UAT |
| G08 Customer PO | `/customer-pos` commitment/realized/remaining per key/item/UOM, immutable versions/history, amendment Manager-approved, no lower-than-realized/no duplicate active commitment | Rekonsiliasi Customer PO perusahaan; invoice/allocation dan return policy tidak diaktifkan |
| G09 delivery/DO | `/deliveries` planning/dispatch/completion, DO barang/pickup, verified vehicle/driver, ritase/freight, atomic stock-out+realization sekali, accepted-only eligibility; service proof tanpa inventory | OPEN-04 policy memerlukan bukti PC/Finance/Manager; link timbang, return/billing dependency, export resmi |
| G11/G18/G19/G25 integrasi | Shared stock lock/timeline/period/dependency; delivery pending/in-transit memblokir closing; source/fulfillment immutable; role ceiling/grant/scope dan audit | Generic closing keuangan, official reports, backup/deploy/restore evidence |

Evidence: [domain service](../../src/features/commerce/service.ts), [read model](../../src/features/commerce/query.ts), [composer/workspaces](../../src/components/commerce-workspace.tsx), [integration/browser tests](../../tests/commerce.integration.test.ts), [migration](../../prisma/migrations/202610030002_commerce_delivery/migration.sql). Checks aktual dan batas aktivasi ada di [PROGRESS](PROGRESS.md). Legacy invoice viewer belum menjadi billing writer untuk sumber baru.

## Pembaruan produksi / blending / BBM — instruksi lanjutan pengguna

| Gap | Implementasi paket tiga halaman | Gate tersisa |
| --- | --- | --- |
| G14 produksi/mix | `/production` actual SC m³, BP batch/mutu m³, AMP ton; Draft→Submitted→Verified PC berbeda akun→Posted; mix version pembanding, conversion snapshot, shared atomic ledger/audit | Owner metode/mix/density; legacy reconciliation; PWA; live migration/UAT |
| G15 blending | `/blending` source khusus, komponen→hasil atomic; klasifikasi hasil verified mencegah output SC ganda | Spec/formula komponen perusahaan dan evidence |
| G16 BBM | `/fuel` receipt/usage/transfer liter per tangki, minimum stable asset/version ownership/cost/inclusion, KPI plant/periode; AMP hanya referensi usage posted, zero output N/A | Identitas/mapping legacy, rules inclusion perusahaan; HM/KM/recharge tidak diaktifkan |
| G11/G18/G19/G25 integrasi | Guard stock/period/idempotency/dependency dan audit dipakai bersama; reversal source ikut KPI | Closing lintas keuangan/delivery, report resmi, deployment/restore evidence |

Evidence: [service](../../src/features/operations/service.ts), [query](../../src/features/operations/query.ts), [workspace](../../src/components/plant-operations.tsx), [integration tests](../../tests/operations.integration.test.ts), [migration](../../prisma/migrations/202610030001_production_fuel/migration.sql). Hasil final mengikuti [PROGRESS](PROGRESS.md); implementasi bukan pengesahan parameter atau go-live.
## Pembaruan inventory — prioritas PROMPT terbaru

| Gap | Implementasi sesi inventory | Gap/gate tersisa |
| --- | --- | --- |
| G11 ledger/transfer | Ledger append-only Decimal, source/line/date/actor/event key, atomic lock+Serializable/retry, timeline negative guard, dua sisi transfer, saldo/card per UOM/plant; endpoint lama memakai service baru | Produksi/fuel/delivery terhubung pada paket lanjutan; report resmi tersisa; live migration/throughput/restore/UAT |
| G12 receipt/opening | Receipt multi-line dan evidence tanpa supplier PO wajib; opening sekali per pasangan dan adopsi legacy source-preserving, PC/Finance/Manager berbeda akun, checksum/cut-off | Workbook/party master resmi, migration staging/import files dan rekonsiliasi perusahaan; UOM input form dibatasi unit stok utama |
| G13 opname/adjustment/CSR | Tiga alur fullstack: snapshot/fingerprint buku cut-off, fixed variance, later movement tidak ditimpa; stale snapshot/negatif ditolak; Manager berbeda maker; CSR stock-out sekali dan reversal berjejak | Pending opname legacy perlu resubmit/reconciliation; integrasi consumption produksi tidak membuat CSR kedua |
| G18/G19 periode/approval | Close/reopen inventory dengan Finance fingerprint+Manager; lock original/current period reversal; approval/penolakan dokumen berscope dan immutable submitted source | Generic worklist/config/staging dan closing seluruh domain S2/S12 tetap belum selesai |
| G25/G26 migration/audit | Migration additive, legacy ID unique, ledger lama dibekukan, audit submit/sign-off/post/reversal/period dalam transaksi | Backup/live deploy/rollback rehearsal, workbook provenance/UAT sign-off perusahaan |
| G21/G27/G31 UI/report/tests | `/inventory`, `/stock-opnames`, `/internal-issues` mengikuti layout tugas dan shared form/error/dialog; hasil verifikasi terbaru di PROGRESS | Dashboard/report lama belum membaca ledger resmi baru; tidak mengklaim siap production dari tampilan saja |

Evidence: [posting service](../../src/features/inventory/ledger-service.ts), [scoped read model](../../src/features/inventory/ledger-query.ts), [validator](../../src/features/inventory/ledger-schema.ts), [workspace](../../src/components/inventory-workspace.tsx), [migration](../../prisma/migrations/202610020002_inventory_ledger/migration.sql), [unit tests](../../tests/inventory.test.ts), [integration/browser tests](../../tests/inventory.integration.test.ts). [PROGRESS.md](PROGRESS.md) memuat checks aktual, batas sesi dan parameter terbuka. S2 dan master lainnya tidak dianggap sudah selesai karena PROMPT memprioritaskan inventory.

## Pembaruan S1 / W1a — riwayat sesi fondasi

| Gap | Hasil implementasi | Gap/gate tersisa |
| --- | --- | --- |
| G01 auth | Session DB revalidation/version, disable/lock/reset revocation, same-origin mutasi/login; demo hanya non-production | Rate limit login dan audit operasional auth belum selesai |
| G02 role/scope | Lima role, fungsi ADMIN PC/FINANCE, grant action eksplisit, plant scopes dan matriks user; SUPERADMIN hard-denied bisnis termasuk multi-role; no maker self-verification/approval | Assignment user legacy bisnis dan matriks resmi owner; generic approval S2 |
| G03 baca | SSR detail/dashboard policy, invoice `finance.read`, search per-domain; master query/ref plant scoped | Legacy tanpa relasi plant hanya bagi scope semua plant eksplisit; file/export/per-plant domain berikut belum lengkap |
| G04 material/UOM | `/materials` fullstack: katalog/spesifikasi/alias/UOM, konversi Decimal append-version/effective date; verification+bukti dan maker berbeda; unit standar diperiksa | Data legacy UNVERIFIED; spesifikasi/alias/density sumber asli dan transaksi yang memakai snapshot/master baru belum selesai |
| G05 plant/lokasi | `/locations` fullstack: SC/BP/AMP dan stockpile/warehouse/tank/quarry, mapping source legacy eksplisit, scope/verification/version/deactivation | Daftar perusahaan/mapping resmi belum diisi; fuel ledger/capacity rules bukan bagian S1 |
| G13 opname | Approval menolak maker yang sama | Cut-off snapshot/movement/reversal tetap P0; tidak ada klaim opname COMPLETE |
| G25 migration | Migration additive dan backfill source-preserving diuji dari lima migration lama; role/stock/label/UOM tidak dihapus/digabung otomatis | Live backup/deploy/rollback, workbook lineage/staging/reconciliation/sign-off S2+ |
| G26 audit | User/master create/edit/verify/deactivate memakai audit server atomik, reason, source version; hash/password tidak dicatat | Config version+approval, period guard dan audit seluruh event resmi/export belum selesai |
| G27/G31 UI/tests | Tiga halaman list/form/detail sesuai tugas, role navigation/context, error states; 12 unit + 7 integrasi/browser lulus, responsive 1440/768/390/360, typecheck/schema/build lulus; regression Decimal 1 test tambahan lulus | UAT, keseluruhan keyboard/accessibility/visual, domain transaksi/report/recovery belum diverifikasi |
| G06–24, G28–33 lainnya | Tetap mengikuti baseline W0 kecuali perubahan tertera di atas | S2: periode/approval/staging; S3–S5 master dependency lainnya; belum production-ready |

Evidence S1: [access policy](../../src/lib/access.ts), [access service](../../src/features/access/service.ts), [master service](../../src/features/masters/service.ts), [location service](../../src/features/masters/locations-service.ts), [migration](../../prisma/migrations/202610020001_access_masters/migration.sql), [unit tests](../../tests/access.test.ts), [integration/browser tests](../../tests/foundation.integration.test.ts). Rincian parameter terbuka dan verifikasi aktual ada pada [PROGRESS.md](PROGRESS.md). OPEN-01–22 tidak dianggap selesai hanya karena form/status verification tersedia; tidak ada nilai perusahaan yang dikarang.

## Dasar dan batas audit

- Instruksi AGENTS.md dari pengguna dan [PROMPT.md](../../PROMPT.md).
- [Keputusan final](../../planning/Keputusan%20Digitalisasi-Project-Control-PT-AJA.md) menjadi sumber keputusan bisnis tertinggi; [Acuan pembaruan](../../planning/Acuan-Update-QuarryFlow-Project-Control-PT-AJA.md) menjadi acuan konsolidasi, terutama Bagian 3, 8–13.
- Blueprint/Feature Overview dipakai untuk mapping M01–M16 melalui acuan. TBD atau rekomendasi lama tidak menggantikan keputusan FINAL.
- Inspeksi kode, schema, migration, route, komponen, dan tests; database terkonfigurasi diperiksa dengan query baca-saja untuk jumlah record, versi server, dan histori migration. Lingkungan database ini belum dibuktikan sebagai production atau sumber resmi PT AJA.
- Tidak ada posting percobaan, seed, migration, penghapusan, atau perubahan konfigurasi. Belum dilakukan rekonsiliasi isi transaksi, audit screenshot/browser, uji concurrency/integrasi, restore, atau UAT. Workbook, PDF harga, matriks izin XLSX, dan katalog aturan bisnis asli belum tersedia dalam bahan yang diperiksa.
- [Audit lama](../feature-gap.md) tanggal 18 September tidak menggambarkan repository terbaru: quotation/invoice/procurement/assets/settings kini memiliki model dan/atau route. Dokumen ini tidak menganggap keberadaan model sebagai workflow selesai.

Status: **UI statis**, **model saja**, **baca DB**, **tulis parsial**, **belum ada**. Tidak ada klaim fitur COMPLETE tanpa validasi fullstack. Tindakan: **Reuse** mempertahankan bagian valid; **Extend** melengkapi; **Replace** mengganti perilaku yang bertentangan sambil menjaga histori; **New** membangun bagian absen; **Hide** membatasi visibilitas/akses setelah dependency dan data diperiksa, bukan menghapus.

## Evidence repository

| ID | Sumber aktual | Area |
| --- | --- | --- |
| E01 | [package.json](../../package.json), [Compose](../../docker-compose.yml) | Stack, scripts, deployment lokal |
| E02 | [schema](../../prisma/schema.prisma), [migrations](../../prisma/migrations), [seed](../../prisma/seed.ts) | Entity, constraint, role dan data contoh |
| E03 | [auth](../../src/lib/auth.ts), [middleware](../../src/middleware.ts), [login](../../src/app/api/auth/login/route.ts), [user update](../../src/app/api/users/%5Bid%5D/route.ts) | Session/permission |
| E04 | [inventory service](../../src/features/inventory/service.ts), [transfer API](../../src/app/api/inventory/transfers/route.ts), [opname create](../../src/app/api/inventory/opnames/route.ts), [approve](../../src/app/api/inventory/opnames/%5Bid%5D/approve/route.ts) | Mutasi stok |
| E05 | [commercial list](../../src/components/enterprise-list.tsx), [detail](../../src/components/enterprise-detail.tsx), [API routes](../../src/app/api) | Quotation/SO/delivery/invoice |
| E06 | [production UI](../../src/app/production/page.tsx), [validator](../../src/features/production/schema.ts), [weighbridge UI](../../src/app/weighbridge/page.tsx), [API](../../src/app/api/weighbridge/route.ts) | Produksi/timbangan |
| E07 | [operations list](../../src/components/operations-module.tsx), [detail](../../src/components/operations-detail.tsx), [operations API](../../src/app/api/operations/%5Bkind%5D/route.ts) | Procurement/equipment/maintenance |
| E08 | [dashboard](../../src/app/page.tsx), [report API](../../src/app/api/reports/route.ts), [report UI](../../src/app/reports/page.tsx), [invoice API](../../src/app/api/invoices/route.ts) | Total resmi/export/piutang |
| E09 | [AppShell](../../src/components/app-shell.tsx), [CSS akhir](../../src/app/stonecrusher.css), [root layout](../../src/app/layout.tsx), [badge](../../src/components/status-badge.tsx) | Navigasi, tampilan, responsive |
| E10 | [settings API](../../src/app/api/settings/route.ts), [numbering](../../src/lib/numbering.ts), [audit helper](../../src/lib/audit.ts), [tests](../../tests/business-rules.test.ts) | Konfigurasi, audit, verifikasi |

## Stack dan database aktual

| Komponen | Bukti aktual | Baseline / gap |
| --- | --- | --- |
| Web/backend | Manifest Next.js `^15.1.3`, React `^19.0.0`, TypeScript `^5.7.2`; App Router/route handlers | PHP 8.3/Laravel 12 berbeda; versi manifest bukan bukti versi terpasang |
| UI | CSS biasa, Lucide React; dependensi react-hook-form/Zod/Recharts | Blade/Livewire/Alpine/Tailwind/Filament berbeda; keberadaan dependensi bukan bukti semua digunakan |
| ORM | Prisma `^6.2.1`; FK/index/Decimal dalam schema | Pertahankan model/histori valid; domain target belum lengkap |
| Database | Provider PostgreSQL; Compose `postgres:16-alpine`; query `version()` server terhubung: PostgreSQL 18.6 | Baseline PostgreSQL 16; DB terhubung berbeda dari konfigurasi lokal, jangan downgrade/migrate otomatis |
| Auth | bcrypt; JWT jose 8 jam; cookie httpOnly, sameSite lax, secure production; secret production minimal 32 karakter | Fondasi dapat dipakai; belum revocation, rate limit login, fungsi/plant policy |
| Queue/files/PWA | Tidak ditemukan implementasi Redis, storage S3, upload terotorisasi, manifest/service worker/sync draft dalam source yang diinventaris | New sesuai kebutuhan; deployment eksternal belum diaudit |
| Operasi | Compose DB; tidak ditemukan konfigurasi CI di `.github`; scripts dev/build/start/test/typecheck | HTTPS, staging, backup/restore, monitoring dan private Git belum terbukti dari deployment |

Snapshot jumlah record database saat audit: user 4; role 12; product 5; material 2; customer 3; stockpile 3; inventoryTransaction 4; stockOpname 1; productionBatch 1; salesOrder 2; deliveryOrder 2; invoice 1; payment 1. Jumlah kecil dan seed contoh bukan bukti kelengkapan data perusahaan.

Lima migration `202609180001_initial` sampai `202609180005_system_fleet` memiliki `finished_at` dan tanpa `rolled_back_at`. Ini membuktikan histori tercatat, bukan pemeriksaan drift/checksum/constraint aktual. Migration 002 melakukan backfill ledger dan `DROP COLUMN Stockpile.active` tanpa mapping status nonaktif yang eksplisit: tinjau histori nonaktif sebelum migrasi berikutnya; jangan mengulang migration lama untuk memperbaikinya. Tidak ditemukan CHECK/trigger immutability ledger pada migration yang ditelusuri. `SalesOrderItem.productId`, `StockOpname.productId/materialId`, dan sejumlah actor/source ID belum memiliki relasi FK dalam schema; target perlu integritas sumber yang lebih kuat.

## ADR-001 — Perbedaan stack dan versi database

**Status:** usulan teknis untuk review; bukan CR disetujui. **Keputusan sesi audit:** mempertahankan repository dan data existing tanpa rewrite. Retain stack produksi berbeda dari baseline tetap memerlukan keputusan CR teknis.

Pilihan: (A) retain Next.js/Prisma dengan domain services/policies target; (B) migrasi bertahap ke Laravel; (C) rewrite penuh. A dapat menggunakan auth, viewer, ledger parsial dan tests existing, tetapi membutuhkan CR stack, kontrol operasional setara, serta validasi integrasi. B membutuhkan kontrak data/API, ownership satu jalur tulis, rehearsal dan rollback. C memiliki risiko paling luas pada data dan workflow; tidak menjadi langkah default.

Rekomendasi untuk evaluasi: A dengan bukti biaya, kompetensi tim, hosting dan dukungan jangka panjang; keputusan akhir belum dibuat. Owner keputusan yang disarankan: PIC PT AJA/Manager dan penanggung jawab teknis. Pisahkan keputusan framework dari mismatch DB 18.6 vs 16; periksa dukungan Prisma, extensions, backup/restore lintas versi dan lingkungan terhubung sebelum memilih versi. Jangan mengarang estimasi durasi atau menganggap baseline berubah.

## Fitur aktual vs target

Prioritas audit: P0 = kontrol/data berisiko; P1 = workflow Core; P2 = Complete. Ini prioritas pekerjaan, bukan pengganti tahap rilis.

| ID / area | Aktual dan evidence | Target / gap utama | Dependency | Tindakan / prioritas |
| --- | --- | --- | --- | --- |
| G01 M01 auth | Tulis parsial E03; JWT/cookie/hash/login audit; demo login dibatasi non-production | Rate limit, timeout/revocation setelah disable/role/password berubah; strategi CSRF/origin mutasi; demo terisolasi | Keputusan lingkungan, matriks izin | Extend P0 |
| G02 M01 izin | E02/E03: 12 role seed, SUPER_ADMIN wildcard; permission per API | Lima role FINAL; ADMIN PC/Finance sebagai fungsi, plant/action; SUPERADMIN dilarang transaksi; maker ≠ approver | Mapping user-role dan owner | Replace policy + Extend schema P0 |
| G03 akses baca | E05/E07: detail SSR query DB langsung; dashboard juga tanpa requirePermission; middleware hanya cek login | Policy sebelum query, record/plant scope, file/export/search sejalan. Invoice GET memakai `sales.read`, bukan fungsi Finance | G02 | Extend P0 |
| G04 M02 material/UOM | Model E02 Product/Material terpisah, default TON; seed label inci dan Base Course; belum CRUD master | Canonical/alias terverifikasi, UOM conversion/version/density, stock vs service, plant, active/verification | Data katalog/spec; OPEN-01/02/11/13 | Extend master; Replace asumsi TON/alias P0 |
| G05 M02 plant/lokasi | Stockpile CRUD parsial, location string; topbar plant statis E09; setting satu plant | Plant SC/BP/AMP entity terpisah lokasi/tangki, scope user | G02/G04, daftar lokasi verified | Extend stockpile + New plant/tank P0 |
| G06 customer/supplier/proyek | Customer create/PATCH/soft-delete API+UI create; supplier viewer DB E02/E05 | Reuse identitas valid; proyek/kontrak; term verified; supplier/quarry receipt tanpa supplier PO | G02, master sumber | Reuse + Extend; New proyek P1 |
| G07 M03 quotation/SO | `/quotations`, `/sales-orders`, detail dan API GET; model line snapshot E05 | Draft/submit, service/tunai/kredit, project/plant, harga/kontrak/version, approval deviasi, minimum hotmix tingkat order | G02/G04–06, harga asli OPEN-03/06/21 | Extend viewer + New workflow P1 |
| G08 M04 Customer PO | Belum ada entity/route; PurchaseOrder existing FK supplier, bukan Customer PO E02/E07 | PO customer/lines/versions/amendment; remaining dan blok overdelivery | G07, Manager approval | New P1; jangan rename PO supplier |
| G09 M05 delivery/DO | Viewer list/detail/dispatch board; API GET; header quantity tanpa delivery lines; SJ nullable E02/E05 | Multi-line source PO/version, pickup/DO wajib, assignment, dispatch+stock-out+PO atomic, completion/proof eligible invoice | G08 untuk kredit; ledger G11; OPEN-04/03 | Extend model/viewer + New posting P0/P1 |
| G10 timbang | List UI statis; create/list API dan form entry nyata; serializable numbering/active ticket E06 | Bukti ukur manual terkait receipt/delivery; samakan kg/ton/UOM; tanpa posting kedua atau hardware integration | G04/G09/G12, metode OPEN-11 | Reuse form/API + Replace list statis P1; integrasi otomatis Hide/CR |
| G11 M07 ledger/transfer | Ledger referensi/processingKey unique, transfer IN/OUT+audit serializable E04; saldo agregasi ledger | Exact Decimal, effective date/reversal/source line/plant; satu posting service, idempotency dari request/source stabil, closed-period guard; retry conflict | G02/G04/G05/G18 | Extend P0; ganti key transfer UUID baru per request |
| G12 M07 receipt/opening | Receiving model wajib supplier PurchaseOrder; seed ledger; belum API receipt mandiri E02/E07 | Supplier/quarry/internal receipt, verified quantity/bukti, opening approved migration sekali | G11, OPEN-12/13, G25 | New sumber receipt; Reuse referensi supplier P1 |
| G13 M07 opname/adjustment/CSR | API submit+approve opname, unique key dan transaksi E04; belum UI opname/CSR | Maker-checker/Manager, snapshot cut-off+movement setelahnya, bukti ukur, approval/reject/reversal, CSR sendiri | G11/G18/G19, OPEN-11 | Replace rumus approval opname + Extend; New CSR P0 |
| G14 M06 produksi | UI statis; ProductionBatch/input/output model, validator berat; tidak ada production API E02/E06 | SC/BP/AMP form sesuai UOM; submit/verify akun berbeda/post atomic actual input-output; mix design version | G04/G11/G12/G18, OPEN-11/13 | Replace mock/validasi lintas UOM + Extend model + New posting P1 |
| G15 blending | Tidak ada workflow/model khusus | Produksi Agregat A/B terpisah, trace komponen/output, tidak double count output SC | G14/G11 | New P1 |
| G16 M08 BBM | Belum ada model/route receipt/usage/tangki/KPI | Fuel ledger satu sumber, usage alat/vehicle/plant/purpose, transfer, liter/output verified, zero=N/A, referensi AMP | G05/G11/G14/equipment; OPEN-16/17 | New P1 |
| G17 M09 invoice/AR | Invoice/items/payment model; viewer/GET; invoice sumber SO opsional, tanpa delivery allocation E02/E08 | Issue dari delivery completed/accepted, anti double billing, term/tax snapshot, due-date verified | G09; OPEN-07/21; G02 | Extend viewer/model + New issue P1; Replace query resmi P0 |
| G18 periode/koreksi | Belum entity period, close/reopen, reversal/dependency service | Closed-period guard semua writer, checklist PC+Finance, Manager approve, reversal beralasan/turunan | G02/G19; laporan sumber saat closing | New P0 fondasi, Extend checklist setelah domain selesai |
| G19 M14 approval | ApprovalRequest/History model saja; opname approve langsung tanpa generic history/maker check | Worklist/scope, before-after, approve/reject, request version, Manager berbeda akun; tidak menambah approval issue invoice normal | G02/G18, rules FINAL | Extend model + New policy/UI P0 |
| G20 M09 payment/PPh/aging | Payment satu FK invoice; total minus semua payment; tidak ada allocation/PPh API E02/E08 | Receipt banyak invoice, unallocated, PPh verified terpisah, lock/idempotency, due-date as-of buckets | G17; rekening OPEN-09; G18 | Extend migrasi Payment + New allocation/PPh; Replace kalkulasi P1 |
| G21 M15 dashboard/laporan | Baca DB E08; dashboard stock total campur item/UOM; laporan revenue dari SO non-cancelled; invoice draft bisa masuk AR; CSV client-side | Metrik posted/issued efektif per event/UOM/plant/periode, M1–M4, query layar/export sama; XLSX/PDF audit+permission | G09/G14/G16/G17/G20 | Reuse shell/filter + Replace proyeksi; New export resmi P1 |
| G22 M10 dokumen | Nomor sequence dan string DO/SJ; print tiket browser; belum attachment/file service E02/E10 | Lampiran DO/invoice/payment Core; storage private/download policy; register/jenis surat/issue/cancel Complete | G02, storage; OPEN-20 untuk surat | Reuse numbering + Extend; New files/register P1/P2 |
| G23 M11 aset/vehicle/pekerja | Equipment viewer; vehicle create/update API/viewer; Driver model; maintenance/spare relations E02/E07 | Master minimum Core ownership/assignment/verification+worker; aset finansial/version/depresiasi verified Complete | G02/G05, OPEN-18/19 | Reuse master valid + Extend; New worker/aset/depresiasi P1/P2 |
| G24 M12/M13 HSE | Belum entity/route WCU/DCU/inspection/finding | Detail restricted HSE, ringkasan bisnis, foto/PIC/follow-up; data medis tidak cache default | G23/G22/G02, retention OPEN-22 | New P2 |
| G25 M16 migrasi | SQL migrations dan seed; belum staging/source lineage/reconciliation/sign-off | Checksum sumber, mapping/exception owner, cut-off, trial/reconciliation, PC+Finance terpisah+Manager sign-off, promosi idempotent | G04–20 menurut domain, workbook/cut-off OPEN-22 | New P0/P1; seed bukan import perusahaan |
| G26 audit/numbering/config | Audit helper dan viewer; sequence unique per type/month; settings PATCH Zod+audit E10 | Audit seluruh action resmi/export/reason; config/version+approval Manager; pattern setting belum dipakai formatter; time zone/sequence scope sah | G02/G19, OPEN-20/21/22 | Reuse + Extend P0/P1 |
| G27 UI/navigation | E09 graphite/amber, Segoe UI, CSS akhir override; sidebar semua role, plant/avatar statis; label campur bahasa | Karakter shell dipertahankan, token target Manrope/blue/yellow/red/charcoal, layout sesuai tugas, role visibility dan state lengkap | G02/G05, PAGE-PLAN | Reuse shell/primitives + Extend; Replace label/asumsi statis P1 |
| G28 PWA | Belum manifest/service worker/sync model | Draft produksi+BBM Core; inspeksi Complete; UUID/version/sync/conflict; server revalidasi, tidak offline-post | G02/G14/G16; G24 untuk inspeksi | New P1/P2 |
| G29 procurement/AP | PR/PO supplier/Receiving model+viewer GET E07 | Procurement lengkap/AP di luar baseline; supplier master/receipt tetap perlu | Audit PO/Receiving/sparePart/ledger historis | Hide setelah mapping receipt selesai; Reuse data, jangan delete |
| G30 maintenance/sparepart | Viewer dan model pemakaian, inventory MAINTENANCE_USAGE E02/E07 | Maintenance lengkap di luar baseline; equipment dan histori ledger tetap diperlukan | Audit produksi downtime, stock, assignment | Hide workflow penuh setelah dependency jelas; Reuse master/histori |
| G31 notifikasi/search | API notifikasi per user dan global search berizin dashboard.read E09 | Worklist in-app bisa dipakai; hasil search harus per-domain/plant; automation email/WA di luar scope | G02/G19 | Reuse + Extend; Hide kanal CR |
| G32 CR tambahan | RETURN enum saja; tidak ditemukan fitur retur/rental usage/recharge aktif | Return/credit/replacement, rental billing detail, BBM ABT recharge, oli perlu keputusan scope/parameter | OPEN-05/06/14/15/17 + CR | New hanya setelah CR; Hide sampai sah |
| G33 operasi/tests | 5 test validator; typecheck/schema valid; deployment belum diperiksa E01/E10 | Integration/permission/concurrency/posting/reversal/report/PWA/migration; backup/restore/monitoring/UAT | Seluruh paket sesuai tahap | Extend tests + New operational evidence P0/P1 |

## Temuan yang memengaruhi correctness dan keamanan

1. **P0 — policy SSR belum merata:** detail commercial/operations dan dashboard membaca DB setelah pemeriksaan login middleware, tanpa policy domain. API read yang terproteksi tidak melindungi query SSR ini. Tambahkan policy sebelum pembacaan; cek search dan lampiran dengan scope yang sama.
2. **P0 — SUPER_ADMIN wildcard:** `requirePermission` menerima `*`; seed memberikan wildcard kepada SUPER_ADMIN. Akibatnya pembatasan SUPERADMIN transaksi belum berlaku, termasuk opname approve. Petakan role tanpa memutus histori dan beri larangan action bisnis eksplisit.
3. **P0 — opname cut-off salah:** saat submit, buku disimpan; approve menghitung ulang `variance = physicalStock - current`, lalu mengganti `systemStock`. Contoh uji rancangan: buku cut-off 100, fisik 95, movement berikutnya +20; target adjustment −5 menghasilkan 115, kode sekarang menghasilkan 95. Data contoh ini bukan data PT AJA. Tidak ada pemeriksaan `countedBy != approver` atau role MANAGER eksplisit.
4. **P0 — idempotency transfer belum per-request:** key OUT/IN unik berbasis UUID baru tiap panggilan; retry request menghasilkan transfer baru. Serializable menjaga transaksi atomic, tetapi tidak otomatis memberi deduplication/retry hasil yang sama; konflik serialization belum ditangani sebagai retry terbatas/409.
5. **P0 — periode/lifecycle:** enum umum belum memiliki POSTED/REVERSED; belum period guard dan koreksi dependency. Jangan mass-update APPROVED/COMPLETED menjadi POSTED sebelum membuktikan ledger setiap sumber. Tidak ada API edit/delete ledger teridentifikasi, tetapi immutability database belum ditegakkan.
6. **P0/P1 — total resmi:** invoice API receivable mengecualikan CANCELLED tetapi bukan DRAFT; overdue tidak mengecualikan CANCELLED. `paidMonth` membandingkan bulan tanpa tahun. Reports memakai total SO sebagai revenue, invoice semua status, serta inventory group hanya direction. Dashboard menambahkan sparepart PCS dan material TON dalam total berlabel ton. Definisikan proyeksi yang sama untuk layar/export.
7. **P0 — izin session stale:** role/permission disnapshot JWT; token valid tidak membaca ulang status/user version setelah disable/reset/role change. Login memeriksa status/lockedUntil, tetapi tidak ada limiter login yang ditemukan. Strategi CSRF/origin dan rate limit harus diverifikasi sebelum production; audit ini tidak mengklaim eksploitasi sudah diuji.
8. **P1 — uang/quantity:** database memakai Decimal, tetapi service dan report mengubahnya menjadi Number untuk arithmetic. Snapshot unit/tax/term/konversi belum lengkap. Transfer tidak memvalidasi konversi UOM dua lokasi; produksi validator menjumlahkan berat semua input/output tanpa UOM. Jangan menggeneralisasikan aturan SC ke BP/AMP.

## Dependency dan batas keputusan

Urutan: W0 audit/ADR → W1 policy/master/period/audit/migration staging → W2 ledger/receipt/transfer/opname → W3 produksi/blending/BBM → W4 quotation/SO/Customer PO/delivery → W5 invoice/allocation/PPh/closing → W6 laporan/export/PWA/rehearsal/UAT → W7 Core cut-over → W8 surat/aset/HSE → W9 CR sah.

Produksi dan komersial dapat direncanakan setelah ledger siap; sesi tetap maksimal tiga halaman utama dan setiap alur terkait diselesaikan sebelum paket dinyatakan selesai. Detail sesi ada di [PAGE-PLAN.md](PAGE-PLAN.md). Register OPEN-01–22 tetap mengikuti Acuan Bagian 10; gate diterapkan pada item/proses terkait, bukan membekukan semua development. Belum ada keputusan untuk rewrite, aktivasi CR, menyembunyikan modul, atau cut-over pada sesi ini.
