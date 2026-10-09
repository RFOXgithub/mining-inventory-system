# Progress pembaruan QuarryFlow

## Data dummy development - 3 Oktober 2026

[Seeder](../../scripts/quarryflow-dev-dummy.ts) mengisi minimal 10 baris pada 75 dari 77 tabel aplikasi di database lokal `quarryflow_dev`. Pengecualian: `Role` tetap 5 role final; `InventoryTransaction` legacy tetap kosong karena trigger melarang penulisan. Ledger resmi `StockLedgerEntry` berisi 130 movement. Tabel migration tidak dimodifikasi. Contoh legacy berlabel DUMMY/archive, tidak menjadi sumber saldo opening kedua; CR tidak diaktifkan.

Data mencakup master/plant, stok, 10 contoh setiap proses SC/BP/AMP/blending dan BBM, quotation/PO/SO/pickup/DO, invoice/receipt/allocation/PPh, aset/depresiasi/koreksi, dokumen, inspeksi/followup dan WCU/DCU. Approval dan posting mengikuti service maker-checker. Bukti/verifikasi dummy hanya simulasi development, bukan keputusan perusahaan. Akun operasional existing beserta password tetap; 10 user dummy tambahan nonaktif.

Validasi PASS: typecheck; semua FK melalui constraint database; cakupan jumlah tabel; saldo stok nonnegatif; tidak ada sumber operasi duplikat; konsumsi BBM AMP 50 liter tanpa potongan ulang; rekonsiliasi 10 invoice (100.000 - 60.000 allocation - 10.000 PPh = 30.000 outstanding) dan 10 receipt (120.000 - 60.000 = 60.000 unallocated); rerun seluruh seeder tidak menambah baris atau mengubah hash password. Ringkasan hitungan tersimpan privat di `.quarryflow-dev/dummy-summary.json`. Neon/production tidak disentuh; sign-off cut-over tetap wajib.

## Akses development terpisah — 3 Oktober 2026

Pengguna memilih development/staging terpisah untuk akun berizin. Database lokal `quarryflow_dev` pada `127.0.0.1:61014` dibuat dengan autentikasi password; seluruh 11 migration diterapkan **hanya di database lokal baru**. Neon existing tetap schema lama dan tidak dimodifikasi. Next development memakai `.env.local` yang diabaikan Git dan berjalan di `http://localhost:3000`.

[Provisioning development](../../scripts/quarryflow-dev-access.ts) membuat tujuh akun: SUPERADMIN, dua ADMIN PC/Finance, MANAGER, dua HSE dan DIREKTUR, semuanya mempunyai cakupan semua plant dan seluruh action yang dibolehkan role masing-masing. Password acak per akun tidak masuk source/audit. Role ceiling, pembatasan medis dan maker-verifier terpisah tetap berlaku; tidak membuat akun wildcard atau mengaktifkan CR.

Verifikasi: typecheck dan 7 access unit tests lulus; tujuh login HTTP/session lulus; API produksi/BBM/commerce/finance/dokumen/aset/dashboard/medical mengikuti izin 200/403 yang diharapkan. Rerun provisioning ditolak tanpa mengubah password/access existing. Database baru belum diisi data bisnis atau parameter perusahaan; posting masih mengikuti master verified dan activation gates. PostgreSQL serta server development dibiarkan berjalan untuk penggunaan lokal, bukan fixture yang dihapus sesudah test.

## Sesi 3 Oktober 2026 — Tahap 2 dan audit kesiapan Core/Complete

PROMPT.md saat ini meminta Tahap 2. Instruksi lanjutan pengguna meminta audit acuan, acceptance, staging/reconciliation/cut-over dan SOP/UAT sesudah implementasi. **Tiga workspace Tahap 2 tersedia di kode:** `/documents`, `/assets`, `/inspections`; pekerja dan WCU/DCU menjadi tab HSE berizin. Tidak ada deploy, import atau migration database production; CR tetap tidak aktif.

- Dokumen: composer dan preview, register/filter/history, file private dan bundle sumber inventory/produksi/BBM/komersial/keuangan yang resmi. Policy jenis surat/deret version verified; nomor dialokasikan atomik saat issue, approvalRequired sesuai policy. Delapan issue concurrent menghasilkan nomor unik; retry dan cancellation tidak memakai ulang nomor. Approved bundle menahan source yang berubah; permission Finance/fuel tetap diperiksa pada query, issue, download dan retry UUID lama.
- Aset: profil fisik dan finansial terpisah, parameter/provenance/version verified, maker Finance → peer Finance attest → Manager. Garis lurus bulanan dengan parameter aktual useful life/residual/start/prorata/opening; rental tidak otomatis didepresiasi. Batch draft unik asset-period, Finance independen verify dan posting signed event. Koreksi Finance → Manager dengan source/period/dependency/bounds dan idempotency; original/month historis tetap immutable. Pending depreciation/correction dan events masuk closing fingerprint. Nilai buku/export as-of menghitung seluruh signed events, bukan display limit.
- HSE: worker version, checklist aktual per verified version/lokasi, FAIL → finding/PIC/target/foto/bukti, actual follow-up → peer HSE verify. WCU/DCU menyimpan pengukuran/status aktual tanpa threshold medis yang dikarang. Tabel dan ACL private; Manager/Direktur memperoleh ringkasan kerja yang diizinkan saja. Public query/export/audit/offline tidak memuat clinical values, notes atau file.
- File: raw PDF/JPEG/PNG/WebP dengan signature/checksum, maksimal 4 MiB, domain/plant/owner, immutable source binding. Download memeriksa metadata permission sebelum mengambil binary; financial bundle tidak terbaca hanya dengan documents.read. API/binary/detail medis tidak di-cache. Penyimpanan saat ini PostgreSQL private; S3/retention, antivirus dan inline attachment transaksi Core tetap gap teknis.
- Export Complete: CSV server untuk register dokumen, aset/depresiasi/signed correction, checklist/finding/follow-up/worker summary; source ID/plant/status/actor/evidence, totals/parity hash dan audit. Snapshot berubah ditolak; clinical export umum ditolak. Dataset resmi berlebihan meminta filter lebih sempit, bukan diam-diam mengekspor data terpotong.
- UI: editor surat + preview, profil/jadwal aset dan checklist/follow-up memakai pola berbeda sesuai tugas, tetap memakai AppShell/field/dialog/tokens/status yang konsisten. Screenshot desktop/mobile disimpan di [artifacts audit](../../artifacts/quarryflow-audit/documents-composer-desktop.png); viewport 1440/1024/768/390/360 diuji. Footer form lapangan tetap terlihat dan target tombol minimal 44px.
- PWA inspection-only menggunakan runtime schema, draft owner/device/UUID/revision/status, minimal verified refs; exam tidak diterima. Sync online hanya membuat draft dan revalidasi server; conflict tidak overwrite. Session refresh memakai generation guard dan write queue; semantically same plant scope diurutkan untuk menghindari local purge palsu. Pelacakan sementara dihapus setelah audit.
- Staging: [trial CLI](../../scripts/quarryflow-staging-trial.ts) read-only, STAGING database berbeda, file checksum/source version/sheet-row-raw lineage, mapping verified, exception owner, stable proposal UUID. NEW_OPENING ditolak bila existing ledger/opening claim/legacy; EXISTING_BRIDGE membandingkan cutoff tanpa opening kedua. Fixture rerun/double-opening/bridge lulus; belum trial workbook perusahaan. `promotionAuthorized=false` selalu.
- Backup/restore rehearsal lokal memakai pg_dump/pg_restore ke database acak milik test, count source/ledger/exam/depreciation dan private file SHA-256 direkonsiliasi. Evidence fiktif: [trial](../../artifacts/quarryflow-audit/staging-trial-fixture.json), [restore](../../artifacts/quarryflow-audit/restore-rehearsal-fixture.json). Ini bukan RPO/RTO atau sign-off infrastruktur production.
- Paket operasional [STAGING-UAT-CUTOVER](STAGING-UAT-CUTOVER.md) memuat migration staging, mapping/exception, bridge stock/fuel/PO/AR/cash/assets/HSE, cutoff/freeze/delta, backup/rollback, SOP dan UAT AC-01–38. Excel menjadi read-only setelah cut-over; hanya satu sistem menerima transaksi tulis.

### Perbaikan dari audit

JSONB property order semula memicu false payload conflict; hash sekarang canonical tanpa mengabaikan perubahan isi/urutan baris. Serialisasi issue concurrency memakai bounded retry/backoff shared transaction. Bundle UUID lama kini memeriksa domain access sebelum idempotent return, sehingga pencabutan Finance tidak membocorkan snapshot. Koreksi depresiasi menjadi signed Manager-approved event dan tidak menghitung ulang histori. Race sesi lama tidak boleh menulis identitas baru; referensi offline hanya disimpan untuk identity/version/scope yang masih cocok. Pemeriksaan kesiapan cache browser menguji hasil async aktual, bukan menganggap Promise sebagai kondisi true. Assertion logout yang diperketat menemukan shell dapat dibuat ulang oleh PREPARE in-flight; worker kini memeriksa lease sesi sebelum menulis, membatalkan generasi lama saat CLEAR dan mengonfirmasi penghapusan setelah write in-flight selesai.

### Verifikasi aktual audit

| Check | Hasil | Evidence |
| --- | --- | --- |
| `npm test` | PASS 35/35 unit | Domain baseline + prorata/residual/next-month, medical ceiling, letter scheme, strict offline schema, file signature, canonical JSON hash |
| PostgreSQL 18.6 fixture terisolasi | PASS 50/50 backend | 6 foundation + 7 inventory + 6 operations/Core + 8 commerce + 13 finance/Core + 10 Tahap 2; permission/plant, atomic posting/concurrency/idempotency, no-double-count, price/amendment/pickup, invoice/allocation/PPh, reversal/as-of, closing/report/export, file ACL, numbering/depreciation/medical |
| Chrome final | PASS 2/2 workflow suites | Core/produksi/BBM + Tahap 2; viewport 1440/1024/768/390/360, surat draft→issue, aset, medical isolation, inspection/production/fuel offline **reload**→sync, UUID retry/conflict/no ledger, logout local data + shell cache cleanup |
| Staging trial / restore | PASS, termasuk 50 backend di atas | Read-only checksum/lineage/proposal rerun, double-opening blocked, existing bridge delta nol; pg_dump/pg_restore counts dan private file SHA-256 pada DB target terisolasi |
| Schema / worker / documents | PASS | `npx prisma validate`; `node --check public/draft-worker.js`; local document links dan new/updated whitespace check; `git diff --check` |
| Typecheck / production build | PASS | `npm run typecheck`; `npx next build`, generation 83/83; flex alignment CSS menggunakan flex-start/flex-end untuk menghapus compatibility warning |

Total integration/browser **52 PASS** dan unit **35 PASS**. Rerun backend operations/Tahap 2 tidak dihitung dua kali. Browser inventory/commerce/finance lama tidak dijalankan ulang pada audit ini; backend domain tersebut lulus. Setiap suite menerapkan semua migration pada schema acak milik fixture dan membuktikan query Prisma berscope sebelum menulis. Tidak menggunakan workbook atau parameter asli perusahaan.

Schema fixture, DB restore target/dump sementara dan direktori Next test dibersihkan; pemeriksaan akhir tidak menemukan schema/direktori fixture tertinggal. PostgreSQL fixture lokal dihentikan. Generated-only Next/TypeScript dikembalikan tanpa menghapus perubahan pengguna. Tidak mengulang penghapusan binary/checkpoint lama yang sebelumnya ditolak kebijakan; artifact screenshot/trial/restore yang diminta tetap tersedia.

### Kesiapan dan activation gates final

**Core dan Complete siap untuk UAT kode/fixture; belum siap production cut-over.** Critical sign-off belum diberikan. Parameter perusahaan OPEN-04/07/09/18/19/20/21/22, matriks permission, workbook/mapping/cutoff, reconciliation PC + Finance berbeda akun + Manager, HSE privacy/retention, real staging trial/restore/perangkat HTTPS/UAT dan monitoring/hypercare harus diselesaikan sesuai domain.

Gap teknis tetap eksplisit: ADR stack Next.js/Prisma/PostgreSQL 18.6 uji vs Laravel/PostgreSQL 16 acuan; inline attachment Core/link timbang dan S3/retention; XLSX/PDF serta format integrasi akuntansi; adapter legacy AR/PO/HSE/medical menunggu sumber/mapping yang sah. Tidak mengaktifkan return/credit note/refund/write-off, recharge/oli/rental usage billing atau fitur CR lain. Migration additive [202610030004_stage2](../../prisma/migrations/202610030004_stage2/migration.sql) hanya diuji pada fixture; tidak diterapkan ke database aplikasi.

## Sesi 3 Oktober 2026 — Core approval/closing, dashboard/laporan, PWA draft

PROMPT.md terbaru meminta paket Core. **Tiga halaman utama selesai di kode:** `/approvals` (inbox + closing/reopen), `/` (dashboard role/plant), `/reports` (viewer/export). PWA mendukung form produksi/BBM existing; tidak menambah halaman transaksi utama.

- Approval membaca source inventory, produksi/BBM, komersial, keuangan dan config version, dengan before/after, alasan/bukti dan history. Action mengikuti permission, plant, maker-checker dan source version/review hash; keputusan didelegasikan ke service domain, tanpa bypass activation gate atau approval invoice normal tambahan.
- Closing menampilkan pending/blocker, invariant timeline stok, history, rekonsiliasi Finance dan ringkasan sumber resmi sesuai izin. PC request → Finance berbeda akun reconcile → Manager berbeda akun approve mengunci periode; reopen memakai workflow/audit yang sama. DO belum selesai dari periode sebelumnya tetap blocker. Fingerprint berubah bila ledger/pending/financial event berubah. Unbilled/outstanding/unallocated ditampilkan untuk review; tidak dibuat kebijakan larangan closing baru tanpa acuan perusahaan.
- Dashboard/report/drill-down/export memakai proyeksi yang sama dari stock ledger, commerce fulfillment/completion dan financial signed events. Ordered, dispatched, completed accepted, invoiced, cash received, allocation dan PPh dipisahkan. Total Decimal per plant/event/UOM/currency; M1–M4 mengikuti kalender final. Balances/PO remaining/AR/unallocated as-of WIB; reversal kemudian tidak mengubah posisi historis. HSE hanya lokasi verified ditugaskan, SUPERADMIN tetap dilarang bisnis.
- Report inti tersedia: produksi, konsumsi aktual, inventory movement/balance, BBM/tank/KPI, sales, Customer PO commitment-realized-remaining, delivery/ritase/pickup/service, invoice/unbilled, receipt/allocation/PPh/unallocated, AR/aging, closing dan approval/history. CSV server memuat referensi source/ID/plant/status/actor, detail, totals dan KPI; snapshot hash menolak export bila data berubah dari layar. Audit export dan formula-injection escaping diterapkan. XLSX/PDF/integrasi software akuntansi tetap pengembangan format lanjutan.
- PWA: manifest/service worker meng-cache shell produksi/BBM dan asset publik saja; API, laporan, finance serta POST tidak di-cache/queue. IndexedDB menyimpan draft owner/device/UUID/revision/timestamp/status dan referensi verified minimum, tanpa saldo/ledger/bukti transaksi server. Sesi offline dibatasi satu jam dan hanya izin read/create produksi/BBM. Logout, pencabutan akses/session dan pergantian identity/scope menghapus data lokal sensitif.
- Sync UUID idempotent membuat/mengedit **DRAFT saja**, memeriksa ulang maker, permission, plant/tangki, periode sumber/tujuan, UOM/konversi/version master. Stale version atau source submitted/final menghasilkan conflict; payload lokal dipertahankan untuk perbandingan/salin UUID baru, tanpa last-write-wins. Validasi gagal tetap editable; tidak ada approval/posting/closing/allocation/payment offline. Revision CAS mempertahankan edit saat request in-flight; Web Locks mencegah sync tab bersamaan bila didukung.
- Paket Core memakai model/migration domain yang sudah ada; tidak menambah dependency atau menjalankan migration/seed database aplikasi. Grant `approvals.read` dan `period.read` perlu diberikan eksplisit melalui administrasi akses; role ceiling tetap berlaku.

### Verifikasi aktual paket Core

| Check | Hasil | Evidence |
| --- | --- | --- |
| `npm test` | PASS 30/30 unit | Exact totals/UOM/currency/event; kalender/filter; CSV injection; strict sync/approval packet; seluruh unit domain baseline |
| PostgreSQL 18.6 terisolasi | PASS 33/33 backend | 7 inventory + 6 produksi/BBM/Core + 8 komersial + 12 keuangan/Core; permission/role/plant, period lock/reopen/fingerprint/carryover, atomic concurrency/idempotency/no-double-count, historical report/aging dan parity dashboard/export |
| Chrome | PASS 1/1 | Tiga halaman Core + form domain existing; layar 1440/1024/768/390/360; CSV download; produksi dan BBM draft offline/reload/sync; satu UUID saat retry, konflik tidak overwrite, tidak menulis ledger, API tidak di-cache, logout menghapus draft |
| Prisma validate | PASS | Schema existing valid; tidak ada migration baru Core |
| Typecheck / production build | PASS | `npm run typecheck`; `npx next build`, generation 77/77 pada source akhir |

Total backend/browser paket ini **34 PASS**, selain 30 unit. Browser finance/commerce/inventory lama tidak dijalankan ulang; regression backend domain tersebut lulus. Fixture memakai schema acak milik test dengan query berscope, tanpa data perusahaan atau parameter asli.

Semua schema fixture/direktori Next test dibersihkan dan PostgreSQL lokal dihentikan. Berkas generated-only Next/TypeScript dikembalikan; diff whitespace dan tautan dokumen diperiksa. Binary PostgreSQL/checkpoint `%TEMP%` dari sesi terdahulu tetap seperti catatan historis; tidak ada upaya mengulang penghapusan yang sebelumnya ditolak kebijakan.

Gate tersisa: pengesahan parameter/event perusahaan, UAT dan uji perangkat lapangan/HTTPS production, migration live serta rekonsiliasi legacy, binary attachment/storage, format XLSX/PDF dan integrasi tujuan akuntansi. Tahap Complete (aset/depresiasi, dokumen/surat, pekerja/inspeksi/medis) mengikuti sesi tersendiri. Hasil kode/tests bukan izin go-live.

## Sesi 3 Oktober 2026 — Invoice / Receipt-allocation / Rekonsiliasi-aging

PROMPT.md pada sesi sebelumnya meminta paket keuangan. **Tiga halaman selesai di kode; 11 backend keuangan + 1 Chrome lulus; typecheck/schema/build lulus; migration aplikasi belum diterapkan.** Status backlog di sesi historis berikut telah diperbarui oleh paket Core di atas.

- `/invoices`: composer sumber completed/accepted barang atau bukti jasa; quantity belum ditagih, harga SO immutable, freight customer terpisah dari biaya internal, snapshot tax/term dan preview. Draft boleh tanpa parameter; issue Finance normal memerlukan pajak verified, kontrak/kredit memerlukan term verified. Tunai tanpa term menampilkan due N/A sebagai exception. Basis invoice/delivery/penerimaan invoice/tanggal eksplisit memakai kalender WIB dan kebijakan verified.
- `/payments`: receipt actual ke rekening verified; allocation dua panel dengan remaining invoice/unallocated receipt, multi-invoice satu customer/currency/plant; bukti PPh actual terpisah dari receipt dan baru efektif setelah Finance kedua verifikasi. PPh dapat dicatat tanpa receipt. Correction/cancellation diajukan Finance dan disetujui Manager berbeda maker/pengesah sumber; dependency settlement serta periode sumber dan correction diperiksa ulang.
- `/receivables`: rekonsiliasi invoice efektif = allocation + PPh + outstanding dan receipt = allocation + unallocated, exception dan prioritas overdue dengan drill-down event. As-of memakai signed events sebelum akhir hari WIB, bukan status target saat ini; reversal kemudian tidak menulis ulang aging/saldo masa lalu. Due kosong, belum jatuh tempo dan hari jatuh tempo dipisahkan. Remaining sumber unbilled diberi label posisi saat ini.
- Outstanding dihitung **invoice efektif − allocation aktif − PPh verified**, tanpa pengurangan header receipt kedua. Status pembayaran dihitung sistem. Arithmetic Decimal; event append-only, source/version guard, audit, shared lock Serializable/retry, timeline saldo sepanjang effective date dan event berikutnya. Source claims juga diperiksa sepanjang waktu agar cancellation kemudian tidak membuka double-billing mundur tanggal. Invoice/service tidak memposting stock-out/realisasi PO kedua.
- Parameter ACCOUNT/TAX/TERM versioned: Finance maker → Finance kedua attest → Manager verify, provenance/tanggal berlaku/snapshot; tidak ada rekening, term atau tarif perusahaan bawaan. Gate hanya pada proses yang menggunakan parameter. Duplicate certificate tidak bisa dikreditkan lagi, termasuk certificate yang sudah direversal; split certificate antar-invoice belum diaktifkan.
- Migration additive [202610030003_finance_ledger](../../prisma/migrations/202610030003_finance_ledger/migration.sql) menambah FinancialConfig/Record/InvoiceLine/Event, FK/check/unique dan immutable/lifecycle/append-only triggers. Diff hanya menambah domain keuangan; FK domain procurement lama tetap dipertahankan. Model/data Invoice/Payment legacy tetap arsip dan tidak diadopsi ke saldo resmi baru tanpa rekonsiliasi/sign-off.
- Inventory closing fingerprint sekarang mencakup pending finance dan event finansial; pending draft/submitted memblokir close, perubahan membatalkan rekonsiliasi lama. Worklist/closing generik lintas seluruh modul, lampiran binary, statement/export resmi dan migrasi AR legacy tetap backlog.

### Verifikasi aktual paket keuangan

| Check | Hasil | Evidence |
| --- | --- | --- |
| Unit tests relevan + baseline business rules | PASS, 27/27 | Role/scope/origin; stock/fuel/commercial; finance calculation exclusive/inclusive/rounding, exact money, header no-double-count, timeline, kalender/due/aging boundaries |
| Keuangan PostgreSQL 18.6 terisolasi | PASS, 11/11 backend | Parameter/activation gates; accepted/freight/service; concurrent double billing/retry; tax/term snapshots; receipt/allocation/PPh concurrence; atomic rollback; correction/dependency/as-of; currency/customer/plant; closed period/pending reconciliation |
| Chrome tiga workspace dan composer | PASS, 1/1 | Invoice draft→issue; receipt draft→post; allocation draft→post; Manager correction; API/SSR SUPERADMIN forbidden; layar/dialog 1440/1024/768/390/360 |
| Regression inventory/produksi/komersial | PASS, 20/20 backend | 7 inventory + 5 produksi/BBM + 8 komersial; seluruh migration finance ikut diterapkan pada fixture |
| Prisma validate/generate dan typecheck | PASS | Schema/client valid dan TypeScript tanpa error |
| Production build | PASS | `npx next build`, generation 71/71; tidak ada dependency baru |

Total integrasi/browser paket ini **32 PASS** (12 finance + 20 regression). Browser tiga domain lama tidak dijalankan ulang; hasil historis tetap pada sesi masing-masing. Fixture PostgreSQL lokal memakai schema acak, query model dibuktikan berscope, tanpa seed/deploy/migration database aplikasi atau perubahan dependency.

Seluruh schema fixture dan direktori Next pengujian dibersihkan; PostgreSQL lokal dihentikan sesudah verifikasi. Binary PostgreSQL dan tiga checkpoint `%TEMP%` dari sesi lama tetap ada karena peninjauan persetujuan otomatis sebelumnya menolak penghapusan (`blocked by policy`). Sesi keuangan tidak membuat checkpoint sementara tambahan. Berkas generated-only Next/TypeScript dikembalikan; diff whitespace dan link dokumen diperiksa.

Gate tersisa: OPEN-07/09/21 term/rekening/tax perusahaan, OPEN-04 policy event fisik, UAT, migration live/AR legacy, storage/upload bukti, report/export serta generic closing. Kode/tests bukan pengesahan data perusahaan atau go-live. Langkah berikut mengikuti PAGE-PLAN, termasuk linking tiket timbang/lampiran dan laporan resmi; tidak mengaktifkan retur/credit note/refund/write-off otomatis.

## Sesi lanjutan 3 Oktober 2026 — Quotation / Customer PO / Delivery

Status: **tiga halaman selesai di kode; 8/8 backend + 1/1 browser lulus; migration aplikasi belum diterapkan**. Instruksi pengguna mendahulukan paket komersial setelah inventory serta produksi/blending/BBM. PROMPT.md tetap berisi inventory; paket ini mengikuti instruksi lanjutan eksplisit pengguna.

- `/sales-orders`: composer quotation/SPH opsional dan SO barang/jasa; customer/proyek, item/UOM, term pembayaran, harga version, ongkos dan preview. `/quotations` mengarah ke composer yang sama, sehingga tidak menambah halaman utama.
- `/customer-pos`: commitment, realisasi dan remaining per baris/UOM; initial PO dan amendment membutuhkan Manager setelah verifikasi PC berbeda maker. Version lama tetap immutable; amendment mempertahankan key/item/UOM dan tidak boleh mengurangi volume di bawah realisasi. Nomor PO customer/proyek yang sudah diajukan tidak dapat menjadi commitment baru ganda.
- `/deliveries`: planning/verification, dispatch, completion dan exception; DO bernomor wajib untuk barang keluar termasuk pickup. Kendaraan/assignment driver memakai version verified; customer pickup menyimpan identitas kendaraan/driver aktual. Ritase serta ongkos customer dan biaya internal dibedakan.
- Tunai boleh SO tanpa quotation/PO; kontrak/kredit wajib PO approved yang sesuai customer/proyek/plant/UOM. Harga, currency, tax treatment, minimum order dan freight term disnapshot. Harga umum tidak melewati harga kontrak customer; deviasi membutuhkan Manager. Minimum order hanya pada order/kontrak, bukan setiap rit; approval harga tidak melewati minimum verified.
- Maker dapat edit draft dengan version guard; submit menyimpan snapshot; peer PC memverifikasi. PO/amendment dan deviasi harga menunggu Manager. Sumber submitted/approved, completion dan realization immutable; setiap keputusan diaudit.
- Dispatch mengunci inventory/SO/PO bersama melalui lock dan Serializable/retry yang sama. Validasi ulang menolak stok negatif dan over-delivery, termasuk request bersamaan. Stock-out, realization dan status DO atomik, unique source-event; retry mengembalikan posting yang sama. Completion tidak membuat ledger/realization kedua.
- Dispatch fisik **tetap mempunyai activation gate OPEN-04**: policy version dengan sign-off PC/operasional, Finance dan Manager berbeda akun serta bukti/tanggal berlaku. Default tidak aktif. Pickup gabungan hanya diizinkan policy yang secara eksplisit menyetujuinya. Nilai fixture tidak dipromosikan menjadi parameter perusahaan.
- Completed/proof menyimpan accepted + rejected = dispatched quantity. Query eligibility invoice hanya accepted dari completed/policy-approved source. Rejected tidak otomatis memulihkan stock/remaining. Jasa/sewa memakai completion bukti layanan dan realization tanpa inventory; dispatch barang dari item SERVICE ditolak.
- Pending delivery dan barang dalam perjalanan masuk fingerprint/check closing inventory. Approval komersial/posting/completion memeriksa periode terbuka. Generic inventory tidak dapat memposting DO; reversal delivery diblokir sampai kebijakan retur fisik dan dependency billing disahkan, agar tidak membuat stock-in semu.
- Migration additive `202610030002_commerce_delivery`: CommerceConfig, CommerceRecord, CommerceFulfillment dan stock kind DELIVERY, dengan FK/unique/check/lifecycle/append-only triggers. Quotation/SalesOrder/DeliveryOrder legacy tetap arsip; query/export dan invoice allocation legacy belum menjadi jalur resmi untuk sumber komersial baru.

### Verifikasi aktual paket komersial

| Check | Hasil | Evidence |
| --- | --- | --- |
| `npm test` | PASS, 22/22 unit | Role/scope/origin, Decimal, stock/fuel, harga/freight/remaining, kontrak/kredit wajib PO |
| Suite komersial PostgreSQL 18.6 terisolasi | PASS, 8/8 backend | Activation gate, harga/version/deviasi/minimum; amendment/history; duplicate commitment; concurrency stok/PO dan rollback; completion/pickup/retry; jasa tanpa inventory; vehicle/freight; scope dan closing |
| Chrome tiga workspace + composer | PASS, 1/1 browser pada source akhir | Form SO → submit → peer PC verify; form DO → submit → peer verify → pickup posting → retry API; API/SSR SUPERADMIN forbidden; viewport 1440/1024/768/390/360 termasuk dialog composer |
| Regression inventory/produksi backend | PASS, 12/12 | 7 inventory + 5 produksi/BBM; schema mencakup migration komersial |
| Typecheck / Prisma validate/generate / `npx next build` | PASS | Client/schema valid; production build berhasil, 67 page pada fase generation |

Total verifikasi integrasi/browser yang dijalankan pada paket ini: **21/21 PASS** (9 komersial + 12 regression backend inventory/produksi). Browser inventory/produksi historis tetap tercatat pada sesi sebelumnya, tidak dihitung ulang di total ini.

Dependency minimum customer/proyek, harga dan kendaraan tersedia sebagai version register verified dalam section/dialog pendukung tiga halaman; mapping master legacy tidak dipromosikan otomatis. Harga asli, kontrak/minimum, pajak/term, identitas kendaraan, metode ukur dan OPEN-04 tetap membutuhkan bukti owner. Invoice issue/allocation/double-billing, kebijakan retur/credit note, linking tiket timbang, laporan/export resmi serta generic closing keuangan tetap paket berikut; eligibility bukan klaim invoice telah issued.

Pemeriksaan remote terakhir dengan transaksi **READ ONLY** berhasil (`healthy=1`); CommerceRecord belum ada di schema aplikasi, sesuai migration live yang belum dijalankan. Verifikasi memakai schema fixture lokal terisolasi tanpa mutasi database aplikasi. Binary PostgreSQL sementara sebelumnya dipakai kembali; port lama tidak dapat di-bind, sehingga server memakai port lokal kosong. Seluruh schema fixture sudah dihapus (count akhir 0), direktori Next pengujian dibersihkan dan PostgreSQL sementara dihentikan. Peninjauan persetujuan otomatis tetap menolak penghapusan berkas `%TEMP%` dengan alasan `blocked by policy`, termasuk checkpoint `quarryflow-commerce-schema-before.prisma`; binary dan checkpoint lama tercantum pada sesi sebelumnya. Tidak ada dependency baru di repository, seed/deploy atau migration live.

## Sesi lanjutan 3 Oktober 2026 — Produksi / blending / BBM

Status: **tiga halaman selesai di kode; 5/5 skenario backend + 1/1 browser lulus; migration aplikasi belum diterapkan**. Paket ini mengikuti instruksi pengguna setelah paket inventory selesai; maksimal tiga halaman utama pada paket ini.

- `/production`: SC input harian dan hasil ukur m³; BP batch/mutu dan konsumsi aktual; AMP tonase/rekonsiliasi dan referensi usage BBM posted. Form memakai field/baris bahan bersama dengan section pekerjaan berbeda.
- `/blending`: komponen aktual → hasil; source dan ledger terpisah. Klasifikasi produk verified melarang hasil blending dicatat lagi sebagai output SC.
- `/fuel`: receipt/usage/transfer dalam liter, tangki verified, monitoring tangki/alat, purpose, ownership/payer/kontrak/cost responsibility dan inclusion KPI yang disahkan. ID alat tetap antarversion; tidak ada pengecualian berdasarkan nama TM/ABT atau kapasitas jerigen tebakan.
- Draft dapat diedit maker dengan version guard; submit → verifikasi Admin PC berbeda maker/submitter → posting. Source submitted dan snapshot verified immutable; posting consumption+output, dependency dan audit atomik melalui ledger yang sama. Retry kembali ke source/event yang sama.
- Klasifikasi hasil, mix design dan parameter BBM/alat adalah version dengan evidence/tanggal berlaku; Manager berbeda maker mengesahkan. Konversi transaksi→stok menyimpan quantity/UOM asli, faktor/density version snapshot dan hasil Decimal exact. Presisi yang tidak dapat disimpan ditolak, tidak dibulatkan diam-diam.
- Mix version dibandingkan dengan actual, tidak mengganti actual. AMP referensi usage yang sama tanpa stock-out BBM kedua; satu usage dapat ditautkan beberapa batch dan numerator KPI tetap sekali.
- KPI hanya sumber posted efektif per plant/periode WIB, purpose produksi dan inclusion eligible; SC/BP liter/m³, AMP liter/ton. Output nol N/A dengan exception. Blending/transfer tidak menjadi denominator produksi plant.
- Periode inventory juga mengunci source produksi/BBM, termasuk tujuan transfer. Pending source ikut fingerprint closing. Reversal inventory memperbarui status source dan memeriksa dependency usage→AMP sehingga KPI tidak menghitung source reversed.
- Migration additive `202610030001_production_fuel`; model ProductionBatch lama dipertahankan, tidak diubah menjadi sumber posting baru tanpa rekonsiliasi. Dashboard/report legacy belum menjadi proyeksi ledger operasional baru.

### Verifikasi aktual paket produksi / blending / BBM

| Check | Hasil | Evidence |
| --- | --- | --- |
| `npm test` | PASS, 19/19 unit | ACL/origin/scope, validator, Decimal, konversi tanpa tebakan, KPI zero dan hash snapshot tahan urutan kunci JSONB |
| Typecheck + Prisma validate/generate | PASS | Schema additive dan seluruh API/components |
| PostgreSQL 18.6 lokal, schema fixture terisolasi | PASS, 5/5 backend | Config maker-checker/immutable/stable asset; concurrent SC dan rollback; BP actual vs mix; blending terpisah; fuel receipt/usage/transfer; zero output; exclusion verified; AMP usage berulang tanpa stock-out kedua; reversal seluruh batch/usage memperbarui KPI; scope semua referensi, klasifikasi tangki dan closing tujuan transfer; stale snapshot dapat ditolak |
| Chrome tiga halaman | PASS, 1/1 browser | Draft→submit→verifikasi PC berbeda akun→posting, form BBM khusus, direct API/SSR SUPERADMIN forbidden; 1440/1024/768/390/360 |
| Regression inventory pada source akhir | PASS, 8/8 integrasi/browser | 7 backend dan 1 browser; total kedua paket 14/14, termasuk atomic posting, idempotency dan no-double-count |
| `npx next build` | PASS | 64 route/page; source terakhir termasuk produksi/blending/BBM |

Koneksi PostgreSQL remote sempat terputus (P1017/P2024), sehingga verifikasi akhir memakai PostgreSQL 18.6 sementara di localhost dari [binary resmi EDB](https://www.enterprisedb.com/download-postgresql-binaries). Database aplikasi tidak dimigrasikan. Guard test memeriksa table schema dan SQL model Prisma yang benar-benar memakai namespace fixture; insert legacy berada dalam transaksi `SET LOCAL search_path` dan diverifikasi sebelum write, tanpa mengandalkan default session search path. Source hash canonical mencegah false conflict akibat urutan kunci JSONB. Reversal tidak membuat dependency konsumsi ke batch lain; relasi sumber reversal dan dependency asli tetap diperiksa. Seluruh schema fixture dan direktori Next pengujian dibersihkan; PostgreSQL sementara sudah dihentikan. Peninjauan persetujuan otomatis menolak penghapusan binary lokal dan checkpoint schema di `%TEMP%`, sehingga berkas sementara tersebut masih tersimpan. Folder binary: `%TEMP%\quarryflow-postgres-test-eafc53d09e4048d49d37dfa985b65ff2`; checkpoint: `quarryflow-inventory-schema-before.prisma` dan `quarryflow-operations-schema-before.prisma`. Berkas ini hanya artefak verifikasi, bukan dependency/deployment proyek.

Gate: daftar material/plant/lokasi, metode ukur, density, mix design, identitas/ownership/biaya/inclusion alat harus disahkan owner. Tidak ada nilai perusahaan yang dibuat dari fixture. Master alat minimum berada dalam version configuration; mapping equipment/vehicle legacy belum dipromosikan otomatis. HM/KM, PWA/offline dan recharge tetap paket/CR terpisah. Backup, trial/restore, migration live dan UAT belum dilakukan.

## Sesi 3 Oktober 2026 — Inventory / W2, prioritas PROMPT terbaru

Status: **tiga halaman inventory selesai di kode dan lulus verifikasi backend/browser/build; migration database aplikasi belum diterapkan**. PROMPT telah berubah dari fondasi/master menjadi inventory; sesi ini mendahulukan paket S6 dan dependency backend inventory. S2 generik dan master S3–S5 tetap belum selesai.

### Perubahan dan batas sesi

- [x] `/inventory`: saldo per material/lokasi/UOM tanpa menjumlahkan UOM berbeda; kartu stok berurutan menurut tanggal efektif dan sequence event, sumber dan saldo berjalan. Receipt supplier/quarry/internal dengan referensi bukti serta transfer memakai form multi-line dan quantity dalam UOM stok utama.
- [x] `/stock-opnames`: snapshot saldo buku dan fingerprint ledger pada cut-off disimpan server; fisik/metode/bukti diajukan, Manager berbeda akun memposting **fisik − buku cut-off** sekali. Movement sesudah cut-off tetap utuh; posting backdate yang mengubah snapshot mengharuskan opname baru. Adjustment positif/negatif mandiri memerlukan Manager.
- [x] `/internal-issues`: CSR/internal issue mandiri dengan tujuan/penerima dan bukti; stock-out hanya setelah Manager approve. Konsumsi produksi tidak dicatat ulang sebagai CSR; integrasi sumber produksi dikerjakan pada paket produksi.
- [x] StockDocument/line immutable, StockLedgerEntry append-only, unique event key, Decimal 24/6 dengan precision arithmetic 48, source snapshots, actor server dan audit atomik. Submitted → Posted/Rejected; posted dikoreksi lewat reversal beralasan, tanpa edit saldo/source.
- [x] Advisory transaction lock inventory + Serializable dan retry bounded untuk serialization/unique conflict. Request UUID tetap dan payload hash mencegah duplicate submit/post, termasuk request bersamaan. Transfer OUT/IN atomik; negative-stock guard memeriksa seluruh timeline, termasuk movement sesudah posting backdate.
- [x] Reversal memerlukan Manager berbeda maker, tanggal efektif sah, periode sumber/tujuan terbuka, saldo cukup dan turunan posted selesai dahulu. Dependency inventory dicatat secara konservatif; opening/adopsi tidak dibalik langsung, koreksi menggunakan adjustment approved. Dependency produksi/BBM telah diintegrasikan pada paket lanjutan; invoice/payment menunggu integrasi domain berikutnya.
- [x] Opening migration satu kali per material/lokasi, bukti sumber + checksum SHA-256, PC/Finance/Manager berbeda akun. Saldo legacy tidak ditimpa atau di-opening ulang; adopsi menyalin event/tanggal/reference asli dengan legacy ID unique setelah rekonsiliasi. Cut-off opening/adopsi membatasi backdate baru.
- [x] Kontrol close/reopen **khusus inventory**: PC request, Finance merekonsiliasi ledger fingerprint, Manager approve berbeda akun; perubahan setelah rekonsiliasi meminta verifikasi Finance ulang. Periode tertutup menolak posting/backdate/reversal. Dokumen pending termasuk tujuan transfer memblokir close.
- [x] Migration additive `202610020002_inventory_ledger`, trigger immutability ledger lama/baru dan source lines; API transfer/opname lama diarahkan ke mesin baru. StockOpname lama tanpa snapshot cut-off tetap disimpan; approval lama tidak dihitung ulang dengan rumus salah, harus direkonsiliasi/resubmit ke alur baru.
- [x] Scope SSR/API/list/card/seluruh referensi plant; PC tidak dapat menulis plant lain, Finance hanya sign-off yang diberi grant, SUPERADMIN tidak mendapat transaksi. Master dengan saldo/pending source tidak dapat dinonaktifkan; UOM/jenis/mapping yang memiliki histori dilindungi.
- [ ] Terapkan migration S1 + inventory ke database aplikasi setelah backup/review. Belum ada live posting, seed, deploy atau perubahan saldo perusahaan.

### Verifikasi aktual

| Check | Hasil | Batas bukti |
| --- | --- | --- |
| `npm test` | PASS, 15/15 unit tests | Role/scope/revocation/origin, validator existing, Decimal/timeline, input source/lines dan boundary periode WIB; suite DB default dilewati |
| `npm run typecheck`, Prisma generate/validate | PASS | Tidak mengesahkan parameter perusahaan atau live migration |
| Suite inventory PostgreSQL terisolasi | PASS, 7/7 skenario backend | Uji receipt/retry/concurrent submit+post, transfer bersamaan, immutable source/ledger, snapshot/stale/backdate/negative stock, opening/adopsi dan close/reopen |
| Chrome browser tiga halaman | PASS, 1/1 skenario browser | Receipt post, opname/CSR approval, API forbidden dan viewport 1440/768/390/360 |
| `npx next build` | PASS | Kompilasi, typecheck dan seluruh route inventory |

Schema fixture memakai UUID acak dan seluruh migration, termasuk fixture legacy sebelum migration additive. Test tidak menulis schema aplikasi. Migration fixture pada schema unik menggunakan `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` agar tidak bersaing dengan lock migration database aplikasi; kebijakan migration aplikasi tetap normal. Flag diverifikasi pada [dokumentasi Prisma v6](https://docs.prisma.io/docs/orm/v6/reference/environment-variables-reference).

### Parameter terbuka / gate

| Parameter/gap | Status | Tindak lanjut |
| --- | --- | --- |
| OPEN-01/02/11/13 mapping material/lokasi/UOM/metode ukur | Hanya master aktif/VERIFIED dalam scope dapat diposting; receipt memakai UOM stok utama | Sahkan sumber/spec/density dan mapping legacy; konversi input unit lain belum menjadi bagian form posting |
| OPEN-12/22 opening/cut-off/checksum/recovery | Mekanisme sign-off sekali tersedia; nilai perusahaan tidak diisi dari demo | Verifikasi workbook/checksum/manual reconciliation; backup + rehearsal + restore sebelum migration aplikasi |
| Daftar supplier/quarry/penerima CSR resmi | Referensi nama/bukti disimpan; master party/worker lengkap tetap S3–S5 | Hubungkan entity resmi setelah master tersedia; receipt tidak mensyaratkan supplier PurchaseOrder |
| Periode lintas produksi/keuangan | Lock inventory selesai di kode; bukan closing perusahaan lengkap | S2: generic approval/config/staging; S12: checklist dan seluruh writer domain |
| Legacy viewer/dashboard/report | Ledger lama dibekukan; saldo/card inventory baru memakai ledger baru | Dashboard/report lama belum proyeksi resmi baru; jangan gunakan angka lama untuk closing setelah cut-over |
| Pending StockOpname lama / histori tanpa mapping | Dipertahankan dan tidak diposting otomatis | Owner rekonsiliasi, map/verify master, adopsi source, lalu resubmit dengan snapshot cut-off |
| Approval/dependency domain berikut | Inventory mengunci source/turunan sendiri | Produksi/delivery/invoice/payment harus memakai shared posting contract sebelum aktivasi; belum UAT/go-live |

Langkah berikutnya sesuai instruksi pengguna: paket terpisah maksimal tiga halaman `/production`, `/blending`, `/fuel`, memakai dependency ledger/master verified. S2 dan master S3–S5 di luar dependency minimum tetap terbuka.

## Sesi 2 Oktober 2026 — S1 / W1a implementasi fondasi

Status: **tiga halaman S1 selesai di kode dan lulus verifikasi; migration database aplikasi belum diterapkan; belum siap go-live**. Instruksi PROMPT terbaru mengotorisasi implementasi bertahap pada stack existing. W0 di bawah tetap menjadi catatan historis, bukan status kode terbaru.

### Perubahan dan batas sesi

- [x] `/users`: list/editor serta matriks action/fungsi/plant untuk lima role final. ADMIN memakai fungsi PC/FINANCE, grant eksplisit tanpa wildcard; session version mencabut sesi lama setelah perubahan akun/akses/password. SUPERADMIN hanya action teknis dan tidak dapat menembus larangan transaksi melalui role tambahan atau API langsung.
- [x] `/materials`: katalog material/product/service, spesifikasi, plant, UOM, alias terpisah, konversi Decimal berversi/tanggal efektif, status verification dan bukti. Data baru/import legacy mulai UNVERIFIED. Verifier MANAGER berbeda dari pembuat/pengubah; parent/UOM harus verified. Konversi standar KG/TON/L/M3/PCS diperiksa; density/kemasan perusahaan tidak ditebak.
- [x] `/locations`: plant SC/BP/AMP serta lokasi/stockpile/warehouse/tangki/quarry; list/form/detail, verification, edit/version dan deactivation beralasan. Mapping stockpile legacy eksplisit, tanpa mengubah saldo atau mengarang kapasitas.
- [x] Backend Zod, authorization sebelum query/mutasi, validasi seluruh referensi plant, optimistic version, transaksi Serializable dan audit atomik. Master dengan referensi plant di luar cakupan tidak dapat diedit oleh user terbatas.
- [x] Detail SSR/dashboard/search/invoice memakai domain policy. Modul legacy yang belum mempunyai filter plant memerlukan cakupan semua plant yang diberikan eksplisit; user satu plant tidak mendapat akses seluruh perusahaan. Maker-checker approval opname ditambahkan, tetapi rumus cut-off belum diperbaiki.
- [x] Navigation/context user mengikuti sesi; form memiliki loading/error/forbidden, summary error, dialog dan tampilan responsive. Style existing dipertahankan.
- [x] Migration additive `202610020001_access_masters`: mempertahankan user/role/history/Product/Material/Stockpile/ledger existing; backfill katalog UNVERIFIED dan unit standar. Hanya SUPER_ADMIN lama memperoleh mapping teknis SUPERADMIN; role bisnis lama menunggu assignment eksplisit. Seed demo tidak dijalankan dan menolak production.
- [ ] Terapkan migration ke database aplikasi setelah backup, review mapping, dan rencana cut-over/rollback. Pengujian memakai schema PostgreSQL sementara yang sudah dibersihkan, bukan mutasi data aplikasi.
- [ ] S2: periode/closed-period guard, approval generik, versioned config dan migration staging/sign-off. Customer/supplier/proyek, harga/kontrak, rekening/pajak, equipment/vehicle/worker dilanjutkan S3–S5, sesuai batas tiga halaman.

### Verifikasi aktual S1

| Check | Hasil | Batas bukti |
| --- | --- | --- |
| `npm test` | PASS, 12/12 unit tests | Permission, maker-checker, assignment, revocation, origin, validator bisnis; suite DB default dilewati |
| `RUN_FOUNDATION_DB_TESTS=1` + suite foundation + Playwright | PASS, 7/7 integrasi/browser | Migration dari lima migration lama, preservation sumber/saldo, scope/role, master/alias/konversi, edit bersamaan dan audit; tiga halaman melalui browser |
| Regression konversi setelah pemeriksaan faktor standar ditambahkan | PASS, 1/1 targeted integration | Tolak faktor TON→KG salah; simpan presisi Decimal TON→M3 tanpa konversi otomatis |
| Browser Chrome 1440/768/390/360 px | PASS, tidak ada overflow halaman | Login dan simpan user/material/alias/plant/tangki; PC ditolak dari users SSR/API; SUPERADMIN ditolak dari API bisnis; bukan UAT seluruh aplikasi |
| `npm run typecheck`, `npx prisma validate`, `npm run build` | PASS, exit 0 | Prisma masih memberi warning konfigurasi deprecated existing; build bukan bukti live migration/go-live |
| `git diff --check` | PASS | Tidak ada whitespace error |

Tidak ada dependency baru, seed perusahaan, perubahan harga/saldo aplikasi, atau deployment. Test server, schema dan direktori sementara dibersihkan. Approval perusahaan atas matriks izin, ADR retain stack dan readiness operasional tetap terpisah dari keberhasilan tests.

### Parameter terbuka dan tindak lanjut

| Parameter/gap | Status setelah S1 | Tindak lanjut |
| --- | --- | --- |
| Mapping user lama, fungsi/action/plant resmi | Belum disahkan; default bisnis tidak diberikan otomatis | SUPERADMIN memasukkan assignment sesuai keputusan owner; PC/Finance migration sign-off harus berbeda akun |
| OPEN-01/02/11/13 katalog, spesifikasi, alias, unit/density/metode ukur | Mekanisme UNVERIFIED + bukti tersedia; nilai perusahaan tetap terbuka | PC/Manager memeriksa sumber asli; jangan menyamakan label inci/Sirtu atau mengaktifkan unit UNKNOWN |
| Daftar plant/lokasi/tangki dan mapping stockpile | Master tersedia; tidak diisi dengan identitas/lokasi perusahaan rekaan | PC memasukkan sumber, Manager berbeda akun memverifikasi; kapasitas belum diasumsikan |
| OPEN lainnya: harga/term/rekening/pajak, aset/vehicle/worker, cut-off/retensi | Tetap terbuka sebagaimana W0/Acuan | Selesaikan bersama owner pada sesi domain terkait; data demo bukan parameter production |
| Periode/config/approval/staging | Belum diimplementasikan S1 | S2; config bisnis existing belum berversi/approval, belum closed-period guard pada writer |
| Keamanan/legacy lanjutan | Login rate limit, file policy dan query legacy per-plant masih terbuka | Lanjutkan fondasi; legacy sementara fail closed bagi user plant-terbatas |
| Opname/ledger | Self-approval diblokir; cut-off, idempotency, reversal/dependency belum selesai | S5–S6; jangan menganggap kontrol saldo/posting COMPLETE |

Langkah berikutnya: **S2 / W1b — Pengaturan/periode, Approval, Migration/data quality**. Lanjutkan kode S1 ini tanpa mengulang audit atau memperluas sesi yang sama ke master berikutnya. W1 keseluruhan tetap belum selesai; aplikasi belum production-ready.

## Sesi 2 Oktober 2026 — W0 audit/perencanaan

Status: **audit repository dan rencana selesai; implementasi belum dimulai; belum siap go-live**. Commit sumber `b315e70`. Sesi memilih **0 halaman untuk diubah**. Scope hanya empat dokumen di folder ini; kode aplikasi, schema, data, PROMPT dan sumber planning tetap dipertahankan.

### Pekerjaan sesi ini

- [x] Baca instruksi AGENTS.md dari pengguna, PROMPT.md, Acuan pembaruan dan Keputusan final. Tidak ditemukan file AGENTS.md tambahan pada inventaris repository.
- [x] Audit manifest stack, schema/migration, route UI/API, auth/permission, business rules, komponen/CSS dan tests relevan.
- [x] Query database terkonfigurasi secara baca-saja: counts, versi PostgreSQL dan histori lima migration. Tidak menjalankan seed/posting/migration/mutasi.
- [x] Bedakan halaman statis, model, viewer DB dan write parsial; koreksi kesimpulan audit lama melalui dokumen baru tanpa mengubah laporan lama.
- [x] Buat [GAP-MATRIX.md](GAP-MATRIX.md), termasuk dependency/tindakan dan ADR-001 stack/DB.
- [x] Buat [IMPLEMENTATION-RULES.md](IMPLEMENTATION-RULES.md), seluruh aturan bersama PROMPT dan kontrol FINAL/gates.
- [x] Buat [PAGE-PLAN.md](PAGE-PLAN.md), task/layout/reuse dan sesi maksimal tiga halaman.
- [x] Catat hasil checks nyata, risiko, blocker dan langkah berikutnya dalam dokumen ini.
- [ ] Audit visual screenshot/browser, responsive/keyboard dan seluruh loading/empty/error/forbidden runtime.
- [ ] Rekonsiliasi data operasional per sumber/ledger dan validasi sumber asli Excel/PDF/XLSX.
- [ ] ERD fisik target, kontrak API, matriks permission rinci dan artefak readiness disahkan owner.

### Hasil verifikasi aktual

| Check | Hasil | Batas bukti |
| --- | --- | --- |
| `npm test` | PASS, 5/5 tests, exit 0 | Validator timbang/produksi/transfer; tidak menguji posting/permission/ledger/allocation/concurrency |
| `npm run typecheck` | PASS, exit 0 | Konsistensi tipe source existing; bukan workflow runtime |
| `npx prisma validate` | PASS, exit 0 | Schema valid; ada warning deprecated `package.json#prisma`; tidak melakukan upgrade atau mengubah config |
| DB query baca-saja dengan Prisma | PASS, counts 13 model | Tidak merekonsiliasi isi transaksi atau membuktikan lingkungan production |
| DB `version()` dan `_prisma_migrations` | PostgreSQL 18.6; lima migration finished, tidak rolled back | Berbeda dari Compose/baseline 16; drift/checksum/restore belum diuji |
| Audit route/method/policy | 28 file API `route.ts` diinventaris; policy dan writer utama ditelusuri | Detail SSR commercial/operations/dashboard belum memiliki domain policy; API permission tidak cukup |
| UI/CSS static review | Shell/badge/table/detail reusable; mobile breakpoints/focus/reduced-motion ada | List produksi/timbang masih statis; bukan bukti responsive atau accessibility browser lulus |
| Skill UI/UX lokal | Query `error summary validation --domain ux -n 2` menghasilkan guidance form web relevan | Rekomendasi error summary fokus+inline, announcement; tidak membuat theme/design-system baru |
| Review artefak audit | Empat dokumen; seluruh tautan lokal diperiksa dengan `Test-Path` dan valid; dependency/gates serta batas halaman ditinjau | Tidak menggantikan UAT atau approval desain/ERD/perusahaan |

Lint/build/integration/E2E/concurrency/UAT/restore tidak dijalankan pada sesi dokumentasi ini. Script lint existing adalah `next lint`, tanpa konfigurasi ESLint yang ditemukan saat inventaris; kompatibilitas script belum diuji. Tidak ada klaim production-ready.

### Temuan prioritas

1. **P0 permission:** 12 role seed vs lima role FINAL; SUPER_ADMIN wildcard dapat melakukan action bisnis; belum fungsi/plant scope. Detail SSR dan dashboard query tidak memakai domain policy. JWT permission tetap sampai token berakhir setelah perubahan akun.
2. **P0 opname:** tidak ada maker-checker/Manager explicit; approve menghitung fisik minus saldo saat approval, sehingga movement setelah cut-off dapat tertimpa. Unique key dan Serializable existing dapat dipakai, tetapi tidak menyelesaikan rule cut-off.
3. **P0 posting:** transfer retry membuat UUID baru; belum shared posting/period/reversal/dependency engine. POSTED/REVERSED belum ada pada enum umum. APPROVED/COMPLETED tidak boleh dianggap bukti posting.
4. **P1 workflow:** produksi UI statis; quotation/SO/delivery/invoice viewer DB tanpa create/submit/post/issue end-to-end. Customer PO, fuel, allocation/PPh, closing, PWA dan migration staging belum ada. Supplier PurchaseOrder bukan Customer PO.
5. **P1 total resmi/UI:** dashboard menggabungkan quantity lintas UOM, report revenue dari order dan AR dapat menyertakan draft; CSV client-side belum export resmi. Manrope/warna target belum diterapkan; plant/avatar statis dan label campur bahasa.

Evidence dan tindakan per temuan tersedia pada G01–G33 dan daftar temuan GAP-MATRIX. Ini daftar pekerjaan implementasi berikutnya, bukan perbaikan yang diklaim selesai.

### Blocker / gate dan owner yang disarankan

| Gate | Dampak | Owner / tindak lanjut |
| --- | --- | --- |
| ADR-001 belum diputuskan; Next.js/Prisma vs Laravel, DB 18.6 vs baseline 16 | Migrasi arsitektur luas/keputusan retain production; tidak memblokir audit ini | PIC/Manager + penanggung jawab teknis: nilai biaya/risiko/kompetensi/hosting dan catat CR teknis |
| Status persetujuan artefak 1–9 Keputusan belum tersedia | Coding setelah readiness sesuai baseline; empat dokumen ini bukan pengesahan artefak tersebut | PIC/Manager/teknis: scope, proses, izin, requirements, rules, workflow, dictionary, ERD, UI |
| Matriks fungsi/plant/action dan mapping user lama belum sah | Aktivasi RBAC/transaksi; data existing perlu dipertahankan | PC/Finance/Manager + teknis; PC dan Finance berbeda akun |
| Workbook/daftar harga/matriks izin XLSX asli belum diverifikasi | Mapping migrasi, harga produksi, 21 worksheet/report coverage | PC/Finance: sumber asli, checksum, provenance dan exception owner |
| OPEN-01–22 pada Acuan Bagian 10 | Gate per item/proses: UOM, freight, dispatch, term/rekening/tax, ownership/aset/surat/cut-off/privacy/recovery | Ikuti owner Acuan; isi value+bukti+approval+effective date; jangan mengarang |
| OPEN-04 dispatch event belum disahkan | Aktivasi stock-out delivery vs completion | Operasional/PC/Finance; putuskan event sekali, uji invoice eligibility |
| OPEN-07/09/21 term/rekening/tax belum sah | Issue kredit/receipt rekening terkait/financial posting | Finance/Manager; draft dan master bisa disiapkan sesuai gate |
| Production/staging/storage/backup-monitoring belum diaudit | Go-live, file access, restore dan operasional | Teknis + owner recovery; uji restore sesuai retensi baseline, sahkan RPO/RTO |
| CR retur/rental detail/recharge/oli belum sah | Fitur tambahan tetap nonaktif | PC/Finance/Manager: scope, policy dan acceptance CR |

Tidak ada blocker teknis yang menyisakan pekerjaan dokumentasi sesi ini. Gates di atas membatasi implementasi/aktivasi domain berikutnya; FINAL stok negatif, overdelivery, lima role dan fuel formula tidak dibuka ulang.

## Checklist rilis dan langkah berikutnya

- [x] W0: audit, matrix, aturan, page plan, ADR usulan dan checks baseline.
- [ ] W1: keputusan/readiness; master canonical/UOM/plant, policy, audit/period, staging.
- [ ] W2: ledger engine exact/atomic/idempotent/concurrency; receipt/opening/transfer/opname/CSR.
- [ ] W3: produksi SC/BP/AMP/blending dan fuel satu sumber; tests actual/output/KPI.
- [ ] W4: quotation/SO/contract/Customer PO amendments, delivery/DO/pickup/complete.
- [ ] W5: issue invoice/term/tax, payment/allocation/PPh/unallocated/aging, close/reopen/reversal.
- [ ] W6: dashboard/report/export resmi, PWA draft, integration/UAT/migration rehearsal.
- [ ] W7: Core sign-off/cut-over, backup/restore/monitoring/SOP/training/rollback; hypercare 4 minggu.
- [ ] W8: surat/register, aset/depresiasi, worker detail/WCU/DCU/inspeksi dan Complete sign-off.
- [ ] W9: CR terpilih hanya setelah scope/acceptance disahkan.

Langkah berikutnya setelah W0 semula adalah S1; hasil S1 dan langkah S2 terbaru tercatat di bagian atas. Review ADR-001/readiness/permission matrix tetap diperlukan sebelum aktivasi production. Jangan memperluas ke transaksi sebelum fondasi sesuai dependency; jangan melakukan rewrite/aktivasi CR untuk melewati gate. Setelah fondasi siap, tangani opname cut-off dan transfer idempotency pada paket ledger dengan regression/integration tests.

Setiap sesi berikutnya menambahkan tanggal, halaman dipilih (maksimal 3), evidence perubahan, verifikasi nyata, gate yang terselesaikan dan langkah berikutnya. Checklist tetap belum selesai sampai alur fullstack dan acceptance terkait benar-benar lulus.
