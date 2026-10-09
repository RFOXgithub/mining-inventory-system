# Rencana halaman QuarryFlow

## Pembaruan Tahap 2 dan audit — 3 Oktober 2026

Tiga halaman utama Tahap 2 tersedia: `/documents`, `/assets`, `/inspections`. WCU/DCU dan pekerja menjadi tab berizin dalam `/inspections`, bukan halaman utama keempat. Register/preview surat, profil/jadwal aset dan checklist/follow-up memakai layout sesuai tugas dengan field, dialog, status, file dan history yang konsisten. Export Complete berada pada workspace asal; SOP/trial staging tidak menambah halaman transaksi.

| Workspace | Perilaku tersedia | Activation gate |
| --- | --- | --- |
| `/documents` | Composer + preview, bundle sumber resmi, filter register, issued numbering atomik, cancellation dan history | Deret/kode verified OPEN-20; approval sesuai jenis; lampiran finansial memerlukan izin Finance |
| `/assets` | Profil fisik/keuangan, versi parameter, batch bulanan, peer Finance verification, posting dan signed correction Manager | Ownership verified; useful life/residual/start/prorata/opening OPEN-18/19; rental tidak otomatis didepresiasi |
| `/inspections` | Checklist aktual, foto/bukti, finding/PIC/target, peer follow-up; pekerja dan tab WCU/DCU private; draft PWA inspeksi | Checklist/worker/lokasi verified, permission/plant, privacy/retention OPEN-22; exam tidak offline |

Catatan “Baru Complete” pada tabel baseline di bawah adalah rencana historis yang digantikan bagian ini. S16/S17 sudah diimplementasikan pada tiga workspace tersebut; tidak membuat `/health-checks` terpisah. S15/cut-over masih memerlukan data perusahaan dan sign-off. Binary private tersedia melalui file/bundle Tahap 2; inline attachment transaksi Core, linking timbang, XLSX/PDF dan integrasi tujuan masih gap. Hasil audit/checks aktual ada di [PROGRESS](PROGRESS.md); readiness staging/UAT/cut-over ada di [STAGING-UAT-CUTOVER](STAGING-UAT-CUTOVER.md).

Diperbarui 3 Oktober 2026. **S1, inventory S6, produksi/blending/BBM, quotation/SO/Customer PO/delivery, keuangan/aging serta Core approval/closing/dashboard/laporan/CSV/PWA draft selesai di kode dan diuji; checks final dicatat di PROGRESS.** S2–S5 di luar workflow yang sudah tersedia, linking timbang, lampiran binary, XLSX/PDF serta migration/UAT perusahaan tetap rencana. Migration aplikasi belum diterapkan. Detail dependency/evidence ada di [GAP-MATRIX.md](GAP-MATRIX.md), aturan di [IMPLEMENTATION-RULES.md](IMPLEMENTATION-RULES.md), hasil checks aktual di [PROGRESS.md](PROGRESS.md).

## Paket PROMPT sebelumnya: tiga halaman keuangan

`/invoices` menggunakan composer sumber delivery/service eligible, quantity/freight remaining, tax/term snapshot dan preview issue. `/payments` menampilkan receipt dan invoice remaining dalam dua panel; dialog allocation, bukti PPh tanpa receipt dan correction tetap dalam domain ini. `/receivables` mempunyai tab rekonsiliasi/exception dan prioritas aging as-of dengan drill-down event. Rekening/pajak/term version serta sign-off berada dalam section/dialog pendukung, tanpa halaman utama tambahan. Parameter perusahaan tidak diisi otomatis. Hasil validasi dan gate aktivasi ada di [PROGRESS](PROGRESS.md).

## Paket lanjutan pengguna: tiga halaman komersial / PO / delivery

`/sales-orders` menggabungkan quotation/SPH opsional dan SO barang/jasa dalam composer item/term/preview; `/quotations` redirect ke halaman ini. `/customer-pos` memusatkan commitment/realisasi/remaining, amendment dan history lengkap tiap root PO pada daftar. `/deliveries` memisahkan planning, dispatch dan completion/proof, termasuk pickup dan jasa tanpa inventory. Section/dialog konfigurasi party/project, price/contract version, vehicle/assignment dan activation policy merupakan pendukung, bukan halaman utama tambahan. Invoice kini tersedia pada paket keuangan di atas; return/timbang/report resmi masih backlog. Implementasi serta checks tercatat di [PROGRESS](PROGRESS.md).

## Paket lanjutan pengguna: tiga halaman produksi, blending, BBM

Inventory S6 sudah lulus backend/browser/build. Paket berikutnya dibatasi `/production`, `/blending`, `/fuel`: form SC harian, BP batch/mutu, AMP rekonsiliasi; blending komponen→hasil; BBM cepat dengan monitoring. Konfigurasi klasifikasi hasil/mix version dan register alat minimum disajikan sebagai section/dialog pendukung pada halaman domain. Ledger, master verified, scope/approval dan periode dipakai sebagai dependency; master perusahaan yang belum verified memblokir action terkait. Hasil checks dan gate ada di [PROGRESS](PROGRESS.md).
## Arah UI dan komponen

Pertahankan AppShell/sidebar/header, struktur card/form, data-scroll, detail/source/history dan Lucide. CSS `stonecrusher.css` dimuat terakhir: karakter aktual graphite/amber, Segoe UI; belum Manrope/warna target Acuan. Rencanakan penyelarasan token global dan label Indonesia melalui review visual bertahap, bukan redesign setiap modul. Plant statis Cileungsi dan avatar AR diganti context user/plant verified; jangan otomatis menggantinya dengan identitas PT AJA yang belum disahkan.

Reuse yang benar-benar ada:

| Existing | Penggunaan yang sesuai | Perlu dilengkapi |
| --- | --- | --- |
| `AppShell` | Kerangka aplikasi/navigation/search/account | Role visibility, plant context, search scope, dialog/focus/error |
| `StatusBadge` | Label status domain dan teks selain warna | Lifecycle posting/approval/delivery terpisah, vocabulary Indonesia |
| `EnterpriseList` / `OperationsModule` | Pola filter/search/pagination/loading/empty/retry/table/export viewer | Ambil primitives seperlunya; jangan memaksakan page universal; export resmi server-side |
| `EnterpriseDetail` / `OperationsDetail` | Header dokumen, facts, sumber/turunan, history | Policy sebelum query, UOM/snapshot benar, domain action, batas histori/pagination |
| CSS `.form-grid`, `.btn`, `.card`, `.data-table`, `.data-scroll` | Konsistensi field/tombol/form/tabel | Label/error association, focus, ukuran sentuh, responsive states |
| `format.ts`, `numbering.ts`, `audit.ts` | Format presentasi, sequence, jejak perubahan | Formula tetap backend Decimal; numbering scope/pattern dan audit reason |

Komponen **rencana baru**, dibuat hanya saat domain memerlukannya: `PlantPeriodFilter`, `QuantityUomField`, line editor transaksi, source selector, posting/approval action bar, attachment panel, audit/source timeline, error summary, approval comparison, allocation editor, sync status. Reuse lintas halaman hanya jika interaksi sama; produksi input-output, payment allocation dan inspeksi tetap komponen domain berbeda.

## Paket Core terbaru — tiga halaman utama

- `/approvals`: inbox + panel source/before-after/alasan/history; tab closing/reopen dengan readiness, blocker, checklist sumber resmi dan sign-off Finance/Manager. S2 approval dan S12 closing berjalan; migration staging tetap sesi terpisah.
- `/`: dashboard role/plant dari query resmi, quantity per UOM dan event berbeda; drill-down sumber. Direktur/Manager/PC/Finance mengikuti domain/action grants; HSE hanya lokasi verified ditugaskan.
- `/reports`: filter domain/plant/periode/as-of/customer/proyek/material/lokasi/status, viewer/totals/KPI dan source detail; CSV server sesuai snapshot layar, audit dan permission. Format XLSX/PDF serta report Tahap Complete belum dibuat.

S14 PWA merupakan pendukung form produksi/BBM existing: tombol simpan draft perangkat, status UNSYNCED/SYNCED/INVALID/CONFLICT, explicit sync/perbandingan/salin UUID baru dan logout cleanup. Shell publik/fallback bukan halaman transaksi keempat. Tidak ada approval/posting/payment offline. Hasil aktual di [PROGRESS](PROGRESS.md).

## Halaman dan tugas pengguna

Role ADMIN di bawah selalu dibatasi fungsi PC/Finance, plant dan action. Semua layout memiliki loading/empty/error/forbidden; detail posted read-only dengan request correction/reversal berizin. Create/edit/submit bukan claim tersedia hanya karena kolom rencana mencantumkannya.

| Halaman / route | Status / pengguna dan tugas | Layout yang cocok | Reuse / pelengkapan | Dependency dan gate |
| --- | --- | --- | --- | --- |
| Dashboard `/` | Existing DB; Direktur/Manager/ADMIN memantau kejadian resmi dan exception | Ringkasan per role+plant/periode, metrik per event/UOM, worklist/drill-down; chart hanya bila membantu tren | AppShell/card/badge; proyeksi resmi baru | Seluruh sumber posted; G21, scope |
| User & akses `/users` | Existing viewer/API create/update; SUPERADMIN mengatur lima role/fungsi/plant/action | User list+editor; permission matrix tab terpisah; dampak akses jelas | Tabel/filter/form; role mapping/session controls | ADR, permission matrix; bukan bisnis SUPERADMIN |
| Material/UOM `/materials` | Baru; PC/Finance sesuai izin memverifikasi canonical/alias/konversi | Master list+detail/editor; tab spesifikasi/alias/UOM/version | Field/tabel/badge; quantity-UOM primitive baru | OPEN-01/02/11/13, tidak auto-merge inci |
| Plant/lokasi/tangki `/locations`, `/stockpile` | Baru+existing stockpile; PC memilih konteks/lokasi | Hierarki plant→lokasi/tangki dengan list+editor; saldo read-only | Stockpile form/card; plant context baru | G05, daftar plant/lokasi verified |
| Customer/supplier/proyek `/customers`, `/suppliers`, `/projects` | Dua existing+proyek baru; master untuk order/receipt | Layout master sederhana konsisten, detail referensi histori | Customer create/API, supplier viewer, field/filter | Verification identitas/term; supplier tidak bergantung full procurement |
| Harga/kontrak `/contracts` | Baru; PC menyiapkan versi harga, Finance term/pajak sesuai izin | Kontrak detail+line price/effective dates; compare draft vs versi aktif | Detail facts/line table; version editor baru | Harga asli, OPEN-03/06/07/21; Manager deviasi |
| Rekening/pajak `/finance-masters` | Baru; Finance memverifikasi parameter | Master list+editor dan version/provenance; same pattern master sederhana | Form/tabel/badge; verified parameter panel | OPEN-09/21, Manager config perhitungan |
| Pengaturan/periode `/settings` | Existing settings; teknis/config owner, PC close/reopen | Settings per kategori; periode list+checklist/request detail | Tabs/field existing, period checklist baru | G18/G19; config version+approval |
| Approval & exception `/approvals` | Baru; maker meminta, Manager review sesuai scope | Worklist kiri, detail before-after/source/dependency kanan; reason approve/reject | Detail/history/badge; comparison baru | G02/G19; maker berbeda, source version |
| Migration/data quality `/migration` | Baru; PC/Finance+Manager meninjau cut-over | Batch wizard: sumber→mapping→exception→rekonsiliasi→sign-off, tanpa posting dari staging | Table/filter/detail; reconciliation panel baru | Checksum/workbook/cut-off OPEN-22; role terpisah |
| Goods receipt `/receipts` | Baru; PC mencatat supplier/quarry/internal | Dokumen+multi-line quantity/UOM/lokasi/bukti, source/purpose; review sebelum post | Form/line editor/attachment/source | Ledger, OPEN-11/12/13; supplier PO opsional |
| Inventory `/inventory` | Existing saldo/movement+transfer write; PC menelusuri/memindahkan stok | Filter item/lokasi/as-of→saldo per UOM→kartu ledger→transfer source/destination | Existing stock card/table/transfer form | Posting service/period/permission/idempotency |
| Opname/CSR `/stock-opnames`, `/internal-issues` | Baru UI; API opname parsial; PC count/request, Manager approve | Opname worksheet buku cut-off/fisik/selisih/bukti; CSR dokumen issue dengan purpose/line | Field/line/table/approval/source history | Cut-off/movement tests, Manager terpisah, G13 |
| Produksi `/production` | Implemented: PC draft-submit, PC berbeda verify/post; SC/BP/AMP actual | Daftar harian+workspace SC/BP/AMP bertab; input aktual dan output berdampingan, review/verifikasi | Shell/card/field; production editor khusus baru | Ledger/UOM/mix, source verified; tidak semua quantity ton |
| Blending `/blending` | Implemented: PC komponen→hasil dan source blending terpisah | Batch input komponen→output dan trace sumber; review sebelum post | Primitives input-output produksi | G14/G15; tidak menambah output SC kedua |
| BBM `/fuel` | Implemented: PC receipt/usage/transfer, peer PC verify; Manager parameter/reversal | Buku tangki+entry cepat per purpose/alat; receipt dan transfer terpisah; rasio/exception kontekstual | Equipment/vehicle selectors, field/ledger | Liter verified OPEN-16/17; AMP usage link tunggal |
| Quotation/SPH di `/sales-orders`; `/quotations` redirect | Implemented: PC quotation opsional dengan verifikasi/deviation Manager | Composer customer/proyek/term+line harga dan preview snapshot | Field/dialog/shell; workflow dokumen | Harga/term verified, permission/numbering; tidak mengurangi inventory |
| SO `/sales-orders` | Implemented: tunai/kredit/kontrak dan barang/jasa | Composer+line; tunai tanpa PO, kontrak/kredit wajib PO; immutable snapshots | Composer quotation/SO, supporting price version | G07; minimum order verified, Manager untuk deviasi |
| Customer PO `/customer-pos` | Implemented: PC register/amendment, Manager approve | Commitment/realisasi/remaining per UOM; version/history dan amendment key tetap | Field/baris item; layout monitoring PO khusus | Ledger/contract/approval; berbeda dari supplier `/purchase-orders` |
| Delivery `/deliveries` | Implemented: planning, verified dispatch, completion/pickup/service | Board+preview/source/accepted proof; dispatch/realization sekali | Shared fields/lines; workspace delivery khusus | Ledger/SO/PO remaining, OPEN-04 sign-off PC/Finance/Manager; legacy detail tetap arsip |
| Timbang `/weighbridge`, `/weighbridge/new` | List statis, form/API write nyata; operator berizin menangkap bukti ukur | Entry bruto/tara/netto fokus; tiket/manual measurement linked receipt/delivery | Existing form/validator/numbering | OPEN-11, unit verified; hardware otomatis di luar scope |
| Invoice `/invoices` | Implemented: source composer, draft/edit/Finance issue | Accepted remaining/harga immutable/tax/term/due/preview; legacy detail tetap arsip | Shared field/dialog, workspace composer khusus | Completed/proof/activation policy; OPEN-07/21; dated anti double bill |
| Receipt/allocation `/payments` | Implemented: receipt actual, allocation, unallocated dan correction | Receipt kiri, invoice remaining kanan; multi-invoice; source/history | Shared field/dialog, allocation dua panel | Verified account, same customer/currency/plant, atomic timeline |
| PPh dalam `/payments` | Implemented: draft/submit/peer Finance verify; tanpa receipt | Certificate actual dan invoice, review/status/reversal | Form bukti dan history dalam halaman allocation | Certificate unik; signed PPh, bukan cash receipt; split belum aktif |
| AR/aging `/receivables` | Implemented: rekonsiliasi dan aging as-of berscope | Perbandingan/exception, prioritas overdue, invoice/receipt/PPh event drill-down | Read model signed ledger, tab/daftar/history | Due missing/not due/today/overdue terpisah; report/export resmi tersisa |
| Laporan `/reports` | Existing viewer+CSV; pengguna berizin memilih report | Katalog report→filter domain→viewer/drill-down→export; chart hanya jika berguna | Filter/table/format; report definitions/export server baru | Query resmi sumber efektif, XLSX/PDF parity/audit |
| Audit `/audit`, notifikasi `/notifications` | Existing viewer; teknis/Manager sesuai izin menelusuri action | Event list→before-after; notifikasi→worklist domain | Existing drawer/table/API | Privacy/scope/history/reason; notifikasi bukan approval source |
| Equipment/vehicle/worker `/equipment`, `/vehicles`, `/workers` | Existing equipment/vehicle viewer/API; worker baru | Master list/detail consistent, ownership/plant/assignment/bukti verified | Existing facts/history/selectors | Minimum Core, OPEN-18; hide maintenance terpisah |
| Lampiran inti pada DO/invoice/payment | Baru; PC umum, Finance keuangan | Panel attachment pada detail asal, upload status/preview/download berizin | Detail cards; storage/attachment panel baru | Core, MIME/size/access; bukan menunggu surat lengkap |
| Document/letter center `/documents` | Baru Complete; PC register/issue, Finance lampiran keuangan | Register/search→preview+bundle sumber→issue/cancel/history | Attachment/source/history/numbering | OPEN-20, approval jenis surat/nomor unik |
| Aset/depresiasi `/assets` | Baru Complete; PC fisik, Finance parameter/verification | Register aset+tab versi finansial; batch depresiasi review/verifikasi | Equipment facts/table; asset editor/batch baru | OPEN-19, unik aset-periode, rule garis lurus |
| WCU/DCU `/health-checks` | Baru Complete; HSE pemeriksaan, bisnis status kerja | Restricted exam form/history; ringkasan terpisah dari nilai medis | Worker selector/form/status | Health policy/retention, tidak default cache |
| Inspeksi `/inspections` | Baru Complete; HSE plan/actual/finding/PIC/follow-up | Checklist lapangan+foto, finding detail+assignment+follow-up; mobile priority | Attachment/worker/equipment/status; inspection editor baru | HSE permission; PWA draft setelah modul siap |
| Procurement/maintenance/sparepart existing | Viewer DB di luar baseline Core | Tidak diperluas; histori read-only/config Hide setelah dependency jelas | Supplier/equipment/ledger referensi tetap dipakai | Jangan hilangkan Receiving/stock/downtime history |
| Return/rental/recharge/oli | CR; route belum ditetapkan | Layout baru hanya setelah workflow/acceptance disahkan | Primitives domain relevan sesudah keputusan | OPEN-05/06/14/15/17 + CR; belum aktif |

## Urutan sesi, maksimal tiga halaman utama

Paket fondasi dapat meliputi backend lintas route yang diperlukan halaman terpilih. Banyaknya sesi tidak berarti estimasi waktu atau komitmen seluruh paket selesai sekali jalan. Bila workflow belum tuntas, lanjutkan halaman yang sama; tidak menambah halaman keempat.

| Sesi usulan | Halaman utama (maksimal 3) | Hasil fullstack yang harus selesai sebelum lanjut |
| --- | --- | --- |
| S0 / W0 — sesi sekarang | Tidak mengubah halaman | Audit+empat dokumen; ADR/gates dan evidence checks. Approval readiness item 1–9 Keputusan masih perlu status dari owner |
| S1 / W1a — kode/tests selesai | User & akses; Material/UOM; Plant/lokasi | Lima role/fungsi/plant/action, SSR/API scoped, no SUPERADMIN business, session invalidation; master verification/conversion/version. Migration/backfill diuji pada schema terisolasi; live migration, parameter verified dan approval perusahaan masih gate. Stack decision sebelum perubahan arsitektur luas |
| S2 / W1b | Pengaturan/periode; Approval; Migration/data quality | Period guard dan approval/maker-checker generik, versioned config/audit, staging tanpa live-post. Closing checklist sumber ditambahkan sesudah domain terkait selesai |
| S3 / W1c | Customer; Supplier; Proyek | Master CRUD/nonaktif/history berizin; provenance identitas/term; query tidak bocor lintas plant |
| S4 / W1d | Harga/kontrak; Rekening/pajak; Equipment minimum | Harga/term/tax versions dan gate verified; equipment valid untuk BBM. Vehicle dan worker minimum dilengkapi S5 |
| S5 / W2a | Vehicle minimum; Worker minimum; Goods receipt | Posting engine shared dengan Decimal/period/idempotency/concurrency; receipt independen supplier PO dan lampiran sumber; vehicle/worker valid untuk operasi |
| S6 / W2b — didahulukan PROMPT | Inventory (receipt/transfer/opening); Opname; Internal issue/CSR | Kode fullstack dengan scoped ledger/card, atomic/idempotent/negative guard, cut-off, maker-checker dan reversal; backend periode/sign-off inventory tersedia. Checks terbaru di PROGRESS; S2 generik, staging dan integrasi ledger domain lain tetap gate |
| S7 / W3a — kode tersedia, paket lanjutan pengguna | Produksi; Blending | SC/BP/AMP draft-submit-verify-post actual, input-output atomic, mix version, no double-output; lanjutkan sesi sama bila tiga plant belum tuntas |
| S8 / W3b — digabung paket tiga halaman pengguna | BBM; Produksi (referensi fuel); shared ledger inventory | Receipt/usage/transfer fuel atomic dan satu source ledger; KPI per UOM/purpose, N/A zero, AMP tidak double-out |
| S9 / W4a | Quotation; SO; Customer PO | Implemented dalam composer/monitoring: draft/submit/peer verification/Manager price+PO approval, tunai/kredit/service, immutable amendment/remaining dan harga snapshot |
| S10 / W4b | Delivery; Timbang manual | Delivery implemented: planning/assignment/pickup/DO, stock-out+PO sekali, completion/accepted proof; OPEN-04 gated PC/Finance/Manager. Linking tiket timbang manual masih paket berikut |
| S11 / W5a — kode/tests selesai | Invoice; Receipt/allocation termasuk PPh; Rekonsiliasi/aging | Eligible source, tax/term gates, dated double-billing, signed allocation/PPh/unallocated; Manager correction/period; checks PROGRESS |
| S12 / W5b — kode/tests Core selesai | `/approvals` inbox dan closing/reopen; laporan AR | Source before-after/history/version/hash, checklist/readiness/carryover/timeline, Finance fingerprint + Manager lock/reopen; grant dan exception policy perusahaan tetap gate |
| S13 / W6a — kode/tests Core selesai | Dashboard; Laporan; audit export | Proyeksi resmi/event/UOM/plant/as-of, role/scoped drill-down; CSV server parity/audit; XLSX/PDF dan report Complete lanjutan |
| S14 / W6b — kode/tests Core selesai | Produksi; BBM (PWA draft pendukung) | UUID/version/dedup/revalidation/source-destination period guard, offline/unsynced/conflict/logout cleanup; hanya draft, tanpa offline post; UAT perangkat/HTTPS production tersisa |
| S15 / W7 | Migration; Pengaturan (operasi) | Rehearsal/cut-off/sign-off, backup restore, monitoring, UAT Core dan rollback. Tidak cut-over hanya karena UI tersedia |
| S16 / W8a | Document/letter center; Aset/depresiasi | Register/numbering/issue-cancel; asset finance version dan batch verified unik; parameter Tahap 2 sah |
| S17 / W8b | Worker detail; WCU/DCU; Inspeksi | Privacy detail medis, plan/actual/photo/finding/PIC/follow-up; PWA draft inspeksi setelah workflow online lulus |
| S18 / W8c | Laporan pendukung; Migration Tahap 2 | UAT/sign-off Complete, reconciliation aset/medis/register yang berizin; hypercare sesuai baseline |

W9 CR tidak dijadwalkan aktif sebelum keputusan. Approval readiness dokumen 1–9, ADR dan data terbuka dicatat sebagai gate; tidak menyatakan empat dokumen audit ini sebagai seluruh artefak ERD/kontrak API/matriks permission yang disahkan.

## Acceptance per halaman dan alur

- **Common:** aksi nyata tersambung API/policy/service/DB; validasi field, input dipertahankan saat gagal; pending action, empty tanpa data demo, retry error, forbidden; deep links/source/history; posted read-only; audit dan attachment terkait.
- **Responsive:** periksa 1440/1024/768/390/360, sidebar mobile/focus, form line editor, scroll tabel lokal tanpa overflow halaman, dialog dan sticky action tidak menutup field. Fokus keyboard/aria-live/label/UOM, status teks dan kontras token. Belum diuji browser pada sesi audit.
- **Workflow:** uji PC vs Finance, plant berbeda, SUPERADMIN bisnis, maker sendiri; API langsung dan SSR. Jalur stok/PO/produksi/BBM/invoice/allocation/PPh/correction direkonsiliasi, bukan hanya tombol sukses.
- **DB:** integration test request bersamaan/retry/source dependency dan closed period; angka exact, snapshot unit/price/tax/term; ledger dapat ditelusuri. Acuan AC-01–38 dipetakan per paket, tidak dianggap lulus oleh lima tests validator existing.
- **Export/offline:** total viewer=export dengan filter/as-of sama; izin/export audit; sync duplicate/conflict dan cache logout. Jangan menampilkan seolah perubahan offline telah posted.
- **Aktivasi:** parameter verified per domain, owner dan bukti jelas, approval yang memang diwajibkan final; rekomendasi event dispatch/retur/service detail tidak menjadi kebijakan diam-diam.
