# BLUEPRINT PEMBANGUNAN SISTEM WEBSITE PROJECT CONTROL PT. AMEERA JAYA ABADI

> **Target implementasi:** Website Project Control berbasis Laravel + frontend web  
> **Dokumen ini tidak memuat code maupun schema database final.**  
> **Sumber utama:** `Audit Kesesuaian MD dengan Project Control XLSX.md`  
> **Sumber konteks:** `Analisis & Rekonstruksi Project Control PT. Ameera Jaya Abadi.md`  
> **Evidence operasional:** `../00-Source/02-Operational-Data/PC-LAPORAN PT. AMEERA JAYA ABADI SEPTEMBER.xlsx`  
> **Tanggal blueprint:** 28 September 2026

> **Catatan keputusan final 29 September 2026:** hanya lima role (`SUPERADMIN`, `DIREKTUR`, `ADMIN`, `MANAGER`, `HSE`); fungsi Admin Project Control dan Finance dipetakan ke `ADMIN`. Untuk closing/reopen, surat/lampiran, dan depresiasi, gunakan [matriks izin](../System-Requirements/02-Actor-Role-and-Permission-Matrix.xlsx) serta [katalog aturan bisnis](../System-Requirements/04-Business-Rule-Catalog.xlsx). Bagian draf ini yang masih bertanda blocked/TBD pada area tersebut adalah riwayat planning, bukan aturan final. Stack teknis yang disebut di draf ini belum disetujui sebagai keputusan implementasi.

## Cara Membaca Status

| Label | Makna implementasi |
| --- | --- |
| `[CONFIRMED]` | Requirement telah dinyatakan dalam hasil brief/analisis sebagai keputusan yang berlaku. |
| `[EVIDENCE]` | Proses, field, atau relasi terlihat pada XLSX; belum otomatis merupakan rule target final. |
| `[BASELINE]` | Berasal dari planning/rekomendasi dan masih perlu validasi scope atau detail. |
| `[NEED-CONFIRMATION]` | Keputusan stakeholder diperlukan sebelum rule, workflow, perhitungan, atau schema terkait difinalkan. |

Prinsip implementasi:

1. Developer boleh membangun kerangka, master, draft transaction, validasi dasar, audit trail, dan konfigurasi untuk area yang masih terblokir.
2. Developer tidak boleh mengaktifkan posting stok, pajak, approval, closing, atau kalkulasi konflik sampai keputusan tertulis tersedia.
3. Anomali XLSX harus masuk migration/exception register dan tidak boleh disalin sebagai business rule.
4. Entity/database yang disebut di dokumen ini adalah **kebutuhan konseptual**, bukan schema final.

# 1. SYSTEM MODULE ARCHITECTURE

Struktur final menggunakan domain bisnis terintegrasi. SC, BP, dan AMP menjadi subdomain dalam satu modul Produksi agar memakai pola transaksi, audit, periode, dan posting stok yang konsisten, tetapi masing-masing tetap memiliki form dan rule terpisah.

| ID | Module | Tujuan | Status | Prioritas | Sumber |
| --- | --- | --- | --- | --- | --- |
| M01 | Platform, User & Security | Autentikasi, user, role, permission, audit log, konfigurasi dan periode | `[CONFIRMED]` role; `[BASELINE]` detail kontrol | P0 | MD Roles; GAP-008/015/016; audit module M12 |
| M02 | Master Data | Referensi material, alias, unit/plant, customer, supplier, harga, rekening, dan tipe dokumen | `[CONFIRMED]` material/harga; lainnya campuran | P0 | Audit 9–10; XO-003/004; AUD-GAP-009 |
| M03 | Sales & Quotation | Mencatat penawaran/penjualan, item, harga, pajak, dan deviasi harga | `[CONFIRMED]` harga/approval; `[BASELINE]` quotation | P0/P1 | Buku Besar; RT-008; AUD-GAP-001 |
| M04 | Customer PO & MOU | Mengendalikan volume order, realisasi, sisa, exception, dan referensi invoice | `[CONFIRMED]` konsep PO; MOU `[NEED-CONFIRMATION]` | P0 | 7 sheet PO; AUD-GAP-006 |
| M05 | Delivery & DO/Surat Jalan | Mencatat pengiriman, material, volume, kendaraan, DO/SJ dan realisasi PO | `[CONFIRMED]` DO wajib | P0 | BR-TEMP-009; PO Buma; Audit 15 |
| M06 | Production SC/BP/AMP | Mencatat input, konsumsi, output, dan rekonsiliasi produksi tiga plant | `[CONFIRMED]` scope; formula `[NEED-CONFIRMATION]` | P0 | Sheet SC/BP/AMP; AC-003/004/008 |
| M07 | Inventory & CSR | Kartu stok, saldo, mutasi, penerimaan, produksi, delivery, CSR, opname dan adjustment | `[CONFIRMED]` CSR memengaruhi stok; posting rule belum final | P0 | Stok Material; BR-TEMP-008; AUD-GAP-002 |
| M08 | BBM | BBM masuk, pemakaian per alat, saldo, relasi produksi, rasio dan exception | `[EVIDENCE]`; formula rasio `[NEED-CONFIRMATION]` | P1 | Laporan BBM; Selisih BBM; AC-002 |
| M09 | Invoice, Payment & Receivable | Invoice, PPN, faktur, receipt, alokasi multi-invoice, selisih dan piutang | `[EVIDENCE]`; pajak/status final sebagian terblokir | P0 | Rekap Invoice; XO-011/012; AUD-GAP-007 |
| M10 | Document & Letter Administration | Bundel dokumen transaksi, upload/arsip, register surat dan penomoran | `[CONFIRMED]` keterkaitan dokumen; taxonomy `[EVIDENCE]` | P1/P2 | Rekap Surat; RT-004; AUD-GAP-008 |
| M11 | Equipment & Vehicle | Master aset/kendaraan, operator/driver, dan hubungan pemakaian BBM/delivery | `[EVIDENCE]`; field tambahan `[BASELINE]` | P1 | Data Alat; Laporan BBM |
| M12 | HSE — WCU & Inspection | Pemeriksaan kesehatan terbatas serta program/actual inspeksi | `[EVIDENCE]`; perlu kontrol privasi | P2 | Hasil WCU; Inspek Alat |
| M13 | Employee / SDM | Data pekerja dan relasi opsional ke application user | `[EVIDENCE]` | P2 | Daftar Pekerja; XO-016 |
| M14 | Approval & Exception Control | Worklist approval dan exception lintas modul | Harga `[CONFIRMED]`; approval lain `[NEED-CONFIRMATION]` | P0/P1 | BR-TEMP-007; AC-006; GAP-003 |
| M15 | Dashboard & Reports | Dashboard per audience dan report pengganti 21 sheet | `[BASELINE]` dashboard; reports `[EVIDENCE]` | P1/P2 | Audit 21–22; seluruh XLSX |
| M16 | Migration & Data Quality | Staging, cleansing, alias mapping, reconciliation, cut-off dan migration sign-off | `[EVIDENCE]` kebutuhan | P0 | AUD-GAP-009/010/012; AC-001–008 |

# 2. FEATURE LIST SETIAP MODULE

## M01 — Platform, User & Security

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M01-F01 | Authentication & Session | Kredensial → sesi terautentikasi/logout | Semua user | - | `[BASELINE]` | P0 | NFR/role MD |
| M01-F02 | User Management | Identitas user, status, role → akun aplikasi | Superadmin | M01-F03 | `[CONFIRMED]` kebutuhan user | P0 | Role brief |
| M01-F03 | Role & Permission | Role dan hak aksi → pembatasan modul/data | Superadmin | - | Role `[CONFIRMED]`; matrix `[NEED-CONFIRMATION]` | P0 | GAP-008 |
| M01-F04 | Audit Log | Create/edit/delete/approve/post/export → jejak immutable | Sistem, Superadmin/auditor | Semua modul | `[BASELINE]` | P0 | GAP-016 |
| M01-F05 | Period & Closing | Periode/cut-off/status → periode terbuka/terkunci | Admin/Manager | M14 | `[BASELINE] [NEED-CONFIRMATION]` | P1 | AUD-GAP-012; GAP-015 |
| M01-F06 | System Configuration | numbering, unit, precision, file limit → konfigurasi terkontrol | Superadmin | M02/M10 | `[BASELINE]` | P1 | M12 planning |

## M02 — Master Data

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M02-F01 | Material & Product | nama, kategori, unit, type, active → referensi material/produk | Admin; approval owner data TBD | M02-F02/F03 | `[CONFIRMED]` | P0 | Audit 10; BREQ-001 |
| M02-F02 | Material Alias/Normalization | istilah historis → material canonical/migration decision | Admin/data owner | M02-F01 | `[EVIDENCE]` | P0 | AUD-GAP-009 |
| M02-F03 | Unit, UOM & Plant | m³/ton/liter; SC/BP/AMP → referensi pengukuran/unit | Superadmin/Admin | - | `[EVIDENCE]` | P0 | Sheet produksi |
| M02-F04 | Customer | identitas dan atribut pajak TBD → pihak transaksi | Admin | - | `[EVIDENCE]`; pajak `[NEED-CONFIRMATION]` | P0 | Buku Besar/Invoice |
| M02-F05 | Supplier | identitas supplier → sumber penerimaan | Admin | - | `[BASELINE] [NEED-CONFIRMATION]` | P2 | GAP-011 |
| M02-F06 | Standard Price | material, periode, harga → harga pembanding | Admin/Manager TBD | M02-F01 | `[CONFIRMED]` | P0 | BR-TEMP-006/007 |
| M02-F07 | Payment Account | nama rekening/type/status → referensi receipt | Superadmin | - | `[NEED-CONFIRMATION]` | P0-blocked | GAP-001 |
| M02-F08 | Document Type & Numbering | PO/SPH/SO/SP/SK/SD/DO/invoice → taxonomy/format nomor | Admin/Superadmin | M01-F06 | `[EVIDENCE]`; rule `[NEED-CONFIRMATION]` | P1 | XO-013; AUD-GAP-008 |

## M03 — Sales & Quotation

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M03-F01 | Quotation Header & Lines | customer, item, qty, price → quotation | Admin | M02-F01/F04/F06 | `[BASELINE]` | P1 | Foto/RT-008 |
| M03-F02 | Price Validation | harga standard vs offered → deviation flag | Sistem | M02-F06 | `[CONFIRMED]` | P0 | BR-TEMP-006/007 |
| M03-F03 | Price Override Request | alasan/deviasi → approval request | Admin | M03-F02, M14 | `[CONFIRMED]`; approver TBD | P0 | GAP-003 |
| M03-F04 | Sales Register | tanggal, customer, multi-item, sewa, PPN → transaksi/rekap sales | Admin | M02; boundary TBD | `[EVIDENCE] [NEED-CONFIRMATION]` | P0-blocked | AUD-GAP-001/Conflict 02 |
| M03-F05 | Sales Settlement Snapshot | cash/BNI/BNI PT AJA/piutang/tgl transfer → snapshot rekonsiliasi | Admin | M09 | `[EVIDENCE]`; target model TBD | P1 | XO-001; Buku Besar |

## M04 — Customer PO & MOU

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M04-F01 | Create PO/MOU | customer, nomor, tanggal, dokumen → PO header | Admin | M02-F04, M10 | PO `[CONFIRMED]`; MOU TBD | P0 | 7 PO sheets |
| M04-F02 | PO Product Detail | product, ordered qty, unit → commitment volume | Admin | M02-F01/F03 | `[EVIDENCE]` | P0 | PO sheets |
| M04-F03 | PO Realization & Remaining | delivery allocation → delivered/remaining | Sistem/Admin | M05 | `[EVIDENCE]` | P0 | Audit 13 |
| M04-F04 | Over-delivery Exception | negative remaining → warning/approval TBD | Sistem/Approver TBD | M04-F03, M14 | `[NEED-CONFIRMATION]` | P0-blocked | AC-006 |
| M04-F05 | PO History & Report | filters/customer/product/date → realization report | Admin/Manager/Direktur | M04-F01–F04 | `[EVIDENCE]` | P1 | 7 PO sheets |

## M05 — Delivery & DO/Surat Jalan

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M05-F01 | Delivery Planning/Order | PO/item/volume/date → planned delivery | Admin | M04 | `[BASELINE]` | P1 | Updated flow |
| M05-F02 | DO/Surat Jalan | nomor, tanggal, customer, PO, item, qty → dokumen delivery | Admin | M04, M02, M10 | `[CONFIRMED]` | P0 | BR-TEMP-009 |
| M05-F03 | Vehicle & Driver Assignment | vehicle/operator/rit/volume → delivery assignment | Admin | M11 | vehicle evidence; retase rule TBD | P1 | Data Alat; OA-006 |
| M05-F04 | Delivery Completion | actual qty/proof/status → realization candidate | Admin | M05-F02 | status/timing `[NEED-CONFIRMATION]` | P0-blocked | GAP-009 |
| M05-F05 | Delivery History | filter PO/customer/item → history & remaining | Admin/Manager | M05-F04, M04 | `[EVIDENCE]` | P1 | PO sheets |

## M06 — Production SC/BP/AMP

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M06-F01 | SC Daily Production | date, 9 outputs, production/usage → SC record | Admin | M02, M07 | `[EVIDENCE]`; formulas TBD | P0 | Audit 11.1 |
| M06-F02 | SC Internal Consumption | Base A/B/BP/AMP destination qty → movement candidates | Admin | M06-F01, M07 | `[EVIDENCE]` | P0 | XO-005 |
| M06-F03 | BP Daily Production | raw consumption per grade, output grade → BP record | Admin | M02, M07 | `[EVIDENCE]`; mix rule TBD | P0 | Audit 11.2 |
| M06-F04 | AMP Daily Production | aggregate/asphalt/BBM, AC-WC/AC-BC → AMP record | Admin | M02, M07/M08 | `[EVIDENCE]`; total conflict | P0-blocked | AC-004 |
| M06-F05 | Production Reconciliation | input/output/total/exception → validated production batch | Admin/Manager TBD | F01–F04, M14 | `[BASELINE]` | P0 | AC-003/004/008 |
| M06-F06 | Weekly/Monthly Production Report | period/M1–M4 → totals by plant/material | Manager/Direktur | F01–F05 | `[EVIDENCE]`; week rule TBD | P1 | XO-006 |

## M07 — Inventory & CSR

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M07-F01 | Opening Balance | period/material/unit/qty → opening stock | Admin | M02, M01-F05 | `[EVIDENCE]` | P0 | Stok Material |
| M07-F02 | Stock Movement Ledger | source/type/in-out/qty → traceable mutation | Sistem/Admin | M02 | `[CONFIRMED]` concept; events TBD | P0 | BR-TEMP-008; Audit 12 |
| M07-F03 | Material Receipt | material/source/qty/date/document → stock-in candidate | Admin | M02/M10 | `[EVIDENCE]`; purchase scope TBD | P1 | BP receipts; GAP-011 |
| M07-F04 | Production Posting | approved production → input consumption/output receipt | Sistem | M06, F02 | `[BASELINE] [NEED-CONFIRMATION]` | P0-blocked | GAP-004/014 |
| M07-F05 | Delivery/Sales Posting | completed delivery/sales → stock-out | Sistem | M05/M03, F02 | `[BASELINE] [NEED-CONFIRMATION]` | P0-blocked | OQ-003 |
| M07-F06 | CSR/Sumbangan | recipient, reason, material, qty, document → CSR stock-out | Admin | M02, F02, M14 | `[CONFIRMED]`; approver TBD | P1 | BR-TEMP-008 |
| M07-F07 | Stock Opname & Adjustment | physical qty/reason → adjustment request/posting | Admin/Manager TBD | F02, M14 | `[BASELINE]` | P1 | GAP-015 |
| M07-F08 | Stock Balance & Card | material/plant/period → opening/in/out/balance/trace | Admin/Manager | F01–F07 | `[EVIDENCE]` | P0 | Stok Material |

## M08 — BBM

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M08-F01 | BBM Receipt | tanggal/liter/document/source TBD → fuel-in | Admin | M10 optional | `[EVIDENCE]`; supplier fields not evidenced | P1 | Laporan BBM |
| M08-F02 | Equipment Fuel Usage | date/equipment/liter/unit → fuel-out | Admin | M11 | `[EVIDENCE]` | P1 | Audit 16.1 |
| M08-F03 | Fuel Balance | opening + in - SC/BP usage → balance | Sistem | F01/F02 | `[EVIDENCE]` | P1 | F-007 |
| M08-F04 | Production Link | SC/BP output by period → KPI input | Sistem | M06 | `[EVIDENCE]` | P1 | Formula cross-sheet |
| M08-F05 | Fuel Ratio & Exception | production/usage/exclusion → ratio/warning | Sistem/Manager | F02/F04 | `[NEED-CONFIRMATION]` | P1-blocked | AC-002; XO-008 |
| M08-F06 | Weekly Fuel Report | M1–M4 usage/balance/ratio → report | Manager/Direktur | F01–F05 | `[EVIDENCE]`; M1–M4 rule TBD | P1 | Selisih BBM |

## M09 — Invoice, Payment & Receivable

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M09-F01 | Invoice Draft | customer/work/PO/DO/lines/DPP → draft invoice | Admin | M04/M05/M10 | `[CONFIRMED]` concept; mandatory refs TBD | P0 | Audit 14 |
| M09-F02 | Tax & Total Calculation | DPP/tax treatment/rounding → PPN/total | Sistem | M02-F04/F07 | `[EVIDENCE]`; rule blocked | P0-blocked | GAP-001; AC-007 |
| M09-F03 | Tax Invoice & Supporting Docs | no faktur/files/checklist → invoice bundle | Admin | M10 | `[EVIDENCE]`; mandatory TBD | P1 | RT-004 |
| M09-F04 | Invoice Status & Billing | status event → Draft/Proses/Belum/Sudah Bayar mapping | Admin/Sistem | F01/F05 | `[EVIDENCE]`; transition TBD | P0-blocked | XO-011 |
| M09-F05 | Payment Receipt | date/amount/account/reference → receipt | Admin | M02-F07 | `[EVIDENCE]`; account rule TBD | P0 | Rekap Invoice |
| M09-F06 | Payment Allocation | one receipt → one/many invoice allocations | Admin | F01/F05 | `[EVIDENCE]`; partial rule TBD | P0 | XO-012 |
| M09-F07 | Reconciliation & Difference | invoice totals vs allocations → remaining/difference/exception | Sistem/Admin | F05/F06 | `[EVIDENCE]`; treatment TBD | P0 | AUD-GAP-007 |
| M09-F08 | Receivable Register | invoice/status/remaining → AR list | Admin/Manager/Direktur | F01–F07 | `[EVIDENCE]`; aging baseline | P1 | Invoice statuses |

## M10 — Document & Letter Administration

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M10-F01 | Document Bundle | type/file/link/hard-soft marker → linked document | Admin | M02-F08 | `[CONFIRMED]` relation; mandatory TBD | P1 | Foto/invoice |
| M10-F02 | Create Letter | type, number, date, recipient, subject, note, user → letter record | Admin | M02-F08 | `[EVIDENCE]` | P2 | Rekap Surat |
| M10-F03 | Numbering Validation | type/period/sequence → unique number or exception | Sistem/Admin | M02-F08 | `[BASELINE]` | P1 | duplicates/year typo |
| M10-F04 | Letter Register/Search | filter type/date/recipient/subject → register | Admin/Manager | F02 | `[EVIDENCE]` | P2 | two letter sheets |
| M10-F05 | Archive/Preview/Download | file metadata → controlled document access | Authorized roles | F01/F02 | `[BASELINE]` | P1 | hard/soft copy finding |
| M10-F06 | Document/Letter Report | filters → exportable register/completeness | Admin/Manager | F01–F05 | `[BASELINE]` | P2 | M07 report baseline |

## M11 — Equipment & Vehicle

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M11-F01 | Equipment Master | name, brand/type, operator → asset reference | Admin | M13 optional | `[EVIDENCE]` | P1 | Data Alat |
| M11-F02 | Vehicle Master | vehicle, police no, driver → vehicle reference | Admin | M13 optional | `[EVIDENCE]` | P1 | Data Alat |
| M11-F03 | Operator/Driver Assignment | employee/asset/effective period → assignment | Admin | M13 | `[BASELINE]` | P2 | Operator/Driver column |
| M11-F04 | Fuel Usage Relation | asset mapping → BBM trace | Sistem/Admin | M08 | `[EVIDENCE]` | P1 | Audit 17 |
| M11-F05 | Extended Asset Attributes | ownership/capacity/status/HM/KM/ritase → optional profile | Admin | - | `[BASELINE] [NEED-CONFIRMATION]` | P3 | OA-004 |

## M12 — HSE: WCU & Inspection

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M12-F01 | WCU Examination | employee/date/vitals/lab/TB/BB → exam record | HSE | M13 | `[EVIDENCE]` | P2 | Hasil WCU |
| M12-F02 | BMI Validation | TB/BB lengkap → BMI; kosong → tidak dihitung | Sistem | F01 | `[EVIDENCE]` need error prevention | P2 | 19 DIV/0 errors |
| M12-F03 | WCU Status & Suggestion | assessment/status/suggestion → health follow-up note | HSE | F01 | `[EVIDENCE]`; clinical rule TBD | P2 | WCU fields |
| M12-F04 | Inspection Program | object/frequency/date/target → plan | HSE | M11/M02 | `[EVIDENCE]` | P2 | Inspek Alat |
| M12-F05 | Inspection Actual | object/date/actual → completion count | HSE | F04 | `[EVIDENCE]` | P2 | Inspek Alat |
| M12-F06 | Inspection Detail Extension | checklist/foto/finding/PIC/risk/follow-up → detail | HSE | F04/F05 | `[BASELINE] [NEED-CONFIRMATION]` | P3 | OA-005 |
| M12-F07 | HSE Restricted Reporting | period/object/employee → restricted reports | HSE/authorized management | F01–F05 | `[BASELINE]` | P2 | AUD-GAP-011 |

## M13 — Employee / SDM

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M13-F01 | Employee Registry | name, position, birth, address, join date, phone → employee | Admin/HSE scope TBD | - | `[EVIDENCE]` | P2 | Daftar Pekerja |
| M13-F02 | Employee–User Link | employee optional link to user → identity trace | Superadmin | M01-F02 | `[BASELINE]` | P2 | separation requirement |
| M13-F03 | Employee Report | position/join date filters → employee report | Admin/Manager | F01 | `[EVIDENCE]` | P2 | Daftar Pekerja |

## M14 — Approval & Exception Control

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M14-F01 | Approval Worklist | request/type/status → pending/decision history | Requester/Approver | M01/M03 etc. | `[BASELINE]` | P0 | approval requirement |
| M14-F02 | Price Deviation Approval | old/new price/reason → approve/reject | Admin/Approver TBD | M03 | `[CONFIRMED]`; approver TBD | P0-blocked | BR-TEMP-007 |
| M14-F03 | Stock Adjustment Approval | adjustment/reason → decision | Admin/Manager TBD | M07 | `[BASELINE]` | P1 | stock opname baseline |
| M14-F04 | PO/Over-delivery Approval | excess qty/reason → decision/warning | Admin/Approver TBD | M04/M05 | `[NEED-CONFIRMATION]` | P1-blocked | AC-006 |
| M14-F05 | CSR Approval | CSR request → decision | Admin/Approver TBD | M07 | `[NEED-CONFIRMATION]` | P1-blocked | GAP-010 |
| M14-F06 | Invoice/Closing Approval | invoice or period request → decision | Actor TBD | M09/M01 | `[NEED-CONFIRMATION]` | P2-blocked | GAP-015 |

## M15 — Dashboard & Reports

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M15-F01 | Management Dashboard | period/unit → approved sales/production/stock/AR/BBM/HSE KPIs | Direktur/Manager | transaction modules | `[BASELINE]`; KPI definitions TBD | P2 | Audit 22 |
| M15-F02 | Operational Dashboard | plant/period → production/stock/fuel/PO/delivery status | Admin/Manager | M04–M08 | `[BASELINE]` | P2 | initial planning |
| M15-F03 | Approval Dashboard | user/type → pending/deviation/exception | Approver | M14 | `[BASELINE]` | P1 | price approval |
| M15-F04 | Report Catalogue | filter/export/trace → reports replacing 21 sheets | Authorized roles | all modules | `[EVIDENCE]` | P1 | all XLSX |
| M15-F05 | Export & Snapshot | report parameters → timestamped export | Authorized roles | F04, M01-F04 | `[BASELINE]` | P2 | reporting requirement |

## M16 — Migration & Data Quality

| Feature ID | Feature | Fungsi / Input → Output | Actor | Dependency | Status | Priority | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M16-F01 | Import Staging | workbook row/source/cell → non-posting staging record | Migration Admin | M02 | `[EVIDENCE]` | P0 | 21-sheet audit |
| M16-F02 | Cleansing & Alias Mapping | dirty value → canonical/rejected/unresolved | Data owner/Migration Admin | M02-F02 | `[EVIDENCE]` | P0 | AUD-GAP-009/010 |
| M16-F03 | Validation Exception Register | duplicate/date/formula/identifier issue → resolution status | Data owner | F01/F02 | `[EVIDENCE]` | P0 | AC-002–008 |
| M16-F04 | Reconciliation | source total vs migrated total → signed result | Data owner/Manager | all target modules | `[EVIDENCE]` | P0 | Audit 21 |
| M16-F05 | Cut-off & Migration Sign-off | period/source/version → approved migration batch | Manager/Direktur TBD | F01–F04, M01-F05 | `[NEED-CONFIRMATION]` | P0-blocked | AUD-GAP-012 |

# 3. DETAIL FITUR PENTING

## M02-F01 — Material & Product Master

**Tujuan:** menyediakan identitas canonical untuk bahan baku, produk, dan jasa agar transaksi tidak lagi bergantung pada ejaan header Excel.  
**Actor:** Admin; pemilik keputusan master `[NEED-CONFIRMATION]`.  
**Input:** nama, kode opsional, kategori, unit, material/product type, plant terkait, active flag.  
**Process:** validasi duplikasi; hubungkan alias; material nonaktif tidak dapat dipilih pada transaksi baru tetapi tetap terlihat pada histori.  
**Output:** master material untuk sales, PO, production, inventory, delivery, BBM/AMP dan report.  
**Status transaksi:** Active/Inactive `[BASELINE]`; Draft/Approved master `[NEED-CONFIRMATION]`.  
**Dependency:** M02-F02/F03, M16 cleansing.  
**Source:** Audit §10, AUD-GAP-009, BR-TEMP-001–005.

## M03-F03 — Price Override Request

**Tujuan:** memastikan harga transaksi yang berbeda dari harga master tidak dipakai tanpa jejak keputusan.  
**Actor:** Admin sebagai requester `[INFERENCE]`; approver `[NEED-CONFIRMATION]`.  
**Input:** customer, item, standard price, proposed price, selisih, alasan, referensi quotation/sales.  
**Process:** sistem menandai deviasi dan membuat approval; posting/konversi order ditahan sampai keputusan sesuai rule final.  
**Output:** approval record dan harga transaksi yang dapat ditelusuri.  
**Status:** Draft, Pending Approval, Approved, Rejected `[BASELINE untuk nama status; alur bisnis harga telah CONFIRMED]`.  
**Dependency:** M02-F06, M14-F01/F02, M01-F04.  
**Source:** BR-TEMP-006/007, GAP-003.

## M04-F03 — PO Realization & Remaining

**Tujuan:** mengganti kalkulasi range manual Excel dengan realisasi yang berasal dari detail delivery.  
**Actor:** Sistem menghitung; Admin/Manager melihat.  
**Input:** ordered quantity per PO line dan delivery allocation yang valid.  
**Process:** akumulasi delivered quantity; hitung remaining; simpan trace ke setiap delivery; tandai negative remaining.  
**Output:** ordered, delivered, remaining, delivery history, invoice/DO references.  
**Status PO candidate:** Draft, Active, Partially Delivered, Fully Delivered, Closed, Cancelled `[NEED-CONFIRMATION]`.  
**Dependency:** M04-F01/F02, M05-F04.  
**Source:** Audit §13, AC-005/006.

## M05-F02 — DO/Surat Jalan

**Tujuan:** menjadi bukti pengiriman yang tertaut ke PO, material, customer, vehicle dan invoice.  
**Actor:** Admin.  
**Input:** nomor/tanggal, customer, PO/order optional sesuai rule, material, planned/actual qty, unit, vehicle/driver, attachment.  
**Process:** validasi nomor; validasi material dan PO; catat actual delivery; posting PO/stock hanya setelah event final yang diputuskan.  
**Output:** DO/SJ, delivery record, PO realization candidate, stock-out candidate, invoice source.  
**Status:** Draft/Completed/Cancelled adalah kandidat; status serah-terima `[NEED-CONFIRMATION]`.  
**Dependency:** M04, M07, M10, M11.  
**Source:** BR-TEMP-009, Audit §15, XO-010.

## M06-F01 — Stone Crusher Daily Production

**Tujuan:** mencatat produksi dan pemakaian internal sembilan material SC dengan traceability harian.  
**Actor:** Admin sebagai inputter; validator plant `[NEED-CONFIRMATION]`.  
**Input:** tanggal, Split 0.5/1.2/2.3/3.5, Abu Batu, Sirtu Jaw, Base Course A/B, Pasir Base; production qty; sales/use to Base A, Base B, BP, AMP sesuai material.  
**Process:** simpan detail per material/destination; validasi satuan m³; lakukan reconciliation; jangan gunakan formula continuity Excel yang salah.  
**Output:** daily production, internal-consumption candidates, totals M1–M4/month, stock movement candidates.  
**Status:** Draft, Validated, Posted, Reopened `[BASELINE; authority NEED-CONFIRMATION]`.  
**Dependency:** M02, M06-F05, M07.  
**Source:** Audit §11.1, AC-003, F-004/F-005.

## M06-F03 — Batching Plant Daily Production

**Tujuan:** mencatat konsumsi bahan dan output concrete menurut mutu.  
**Actor:** Admin; validator `[NEED-CONFIRMATION]`.  
**Input:** penerimaan/saldo referensi Semen Tonasa, Tipe 1/V, Pasir; consumption Split 1.2, Split 2.3, Pasir, Semen; output K-175/K-225/K-250/K-300/K-350.  
**Process:** catat actual consumption per grade; validasi tipe angka; hitung total dari detail; recipe/mix design tidak dipaksakan dari XLSX.  
**Output:** batch/daily production, consumption, output, exception dan movement candidates.  
**Status:** Draft, Validated, Posted, Reopened `[BASELINE]`.  
**Dependency:** M02, M06-F05, M07.  
**Source:** Audit §11.2, AC-008, AUD-GAP-003.

## M06-F04 — AMP Daily Production

**Tujuan:** mencatat konsumsi dan output AC-WC/AC-BC tanpa mewarisi konflik total 64,8 vs 48 ton.  
**Actor:** Admin; validator `[NEED-CONFIRMATION]`.  
**Input:** Split 1.2, Split 0.5, Abu Batu, Pasir, Aspal Curah, BBM dryer+ketel, BBM genset, output AC-WC/AC-BC.  
**Process:** total dihitung dari detail setelah definisi output disetujui; tampilkan exception bila total header dan detail berbeda pada migrasi.  
**Output:** AMP production, consumption, BBM linkage, stock movement candidates.  
**Status:** Draft/Validated/Posted `[BASELINE]`; calculation rule `[NEED-CONFIRMATION]`.  
**Dependency:** M02, M07, M08.  
**Source:** Audit §11.3, AC-004.

## M07-F02 — Stock Movement Ledger

**Tujuan:** menyediakan satu jejak mutasi untuk setiap perubahan stok.  
**Actor:** Sistem untuk posting terintegrasi; Admin untuk transaksi manual yang diizinkan.  
**Input:** material, plant/location jika disetujui, date/time, in/out, qty, unit, source type, source ID, reason, posting actor.  
**Process:** validasi periode dan status source; posting idempotent; reversal memakai transaksi lawan, bukan edit saldo; event resmi masih harus diputuskan.  
**Output:** kartu stok dan saldo yang dapat direkonsiliasi.  
**Status:** Draft/Pending/Posted/Reversed `[BASELINE]`.  
**Dependency:** M01-F05, M02, seluruh source transaction.  
**Source:** Audit §12, AUD-GAP-002, OQ-003.

## M07-F06 — CSR/Sumbangan

**Tujuan:** mencatat pengeluaran material non-penjualan yang memengaruhi stok.  
**Actor:** Admin; approver `[NEED-CONFIRMATION]`.  
**Input:** recipient, reason, material, quantity, unit, date, optional supporting document.  
**Process:** draft request; approval jika diputuskan; saat event posting final, buat stock-out dengan source CSR.  
**Output:** CSR record, stock mutation, CSR report.  
**Status:** Draft dan Completed diperlukan secara konseptual; Pending/Approved/Rejected `[NEED-CONFIRMATION]`.  
**Dependency:** M02, M07-F02, M14-F05, M10.  
**Source:** BR-TEMP-008, GAP-010.

## M08-F05 — Fuel Ratio & Exception

**Tujuan:** menyajikan efisiensi BBM hanya setelah numerator, denominator dan exclusion disetujui.  
**Actor:** Sistem; Manager/Direktur sebagai viewer; data owner sebagai resolver.  
**Input:** production total, included fuel usage, period/week, included/excluded equipment.  
**Process:** bila denominator nol, hasil `N/A`, bukan error; formula Crusher tidak diaktifkan sebelum keputusan.  
**Output:** ratio, formula version, included equipment list, exception.  
**Status:** Pending Rule/Calculated/Exception `[BASELINE]`.  
**Dependency:** M06, M08-F02/F04, configuration version.  
**Source:** AC-002, Audit §16.2, XO-008.

## M09-F01 — Invoice Draft

**Tujuan:** membentuk invoice terstruktur dengan tetap mendukung deskripsi pekerjaan dan referensi historis.  
**Actor:** Admin.  
**Input:** customer, invoice number/date, work description, PO/DO selections jika applicable, lines, DPP, tax treatment, documents.  
**Process:** validate unique number; tarik line/reference yang eligible; hitung amount setelah rule pajak; cegah placeholder `Performa Invoice` menjadi key unik.  
**Output:** invoice draft, DPP, PPN, total, AR candidate, document checklist.  
**Status:** Draft/Issued/Cancelled `[BASELINE]`; billing/payment states terpisah.  
**Dependency:** M04/M05/M10/M02, M09-F02.  
**Source:** Audit §14, OA-007.

## M09-F06 — Payment Allocation

**Tujuan:** mendukung satu receipt dialokasikan ke satu atau beberapa invoice sesuai evidence XLSX.  
**Actor:** Admin; reviewer `[NEED-CONFIRMATION]`.  
**Input:** receipt, invoice(s), allocated amount per invoice, date, note/reference.  
**Process:** total allocation tidak boleh melebihi receipt kecuali treatment selisih disetujui; hitung remaining receipt dan remaining invoice; simpan audit.  
**Output:** allocation lines, updated receivable, unallocated amount, difference exception.  
**Status:** Draft/Posted/Reversed `[BASELINE]`; partial payment rule `[NEED-CONFIRMATION]`.  
**Dependency:** M09-F01/F05/F07, M01-F04.  
**Source:** XO-012, formula N67/N69, AUD-GAP-007.

## M10-F01 — Document Bundle

**Tujuan:** menautkan dokumen fisik/digital ke quotation, PO/MOU, DO/SJ, invoice dan payment.  
**Actor:** Admin; viewers berdasarkan permission.  
**Input:** document type, file, number/date, related entity, hard-copy marker, note.  
**Process:** validate file/type/access; version metadata; preview/download; completeness hanya dinilai setelah daftar mandatory disetujui.  
**Output:** traceable attachment bundle dan completeness report.  
**Status:** Uploaded/Archived `[BASELINE]`; Required/Optional `[NEED-CONFIRMATION]`.  
**Dependency:** M02-F08, file storage, M01-F04.  
**Source:** RT-004, BR-TEMP-013.

## M12-F01 — WCU Examination

**Tujuan:** mengganti pencatatan WCU Excel dengan record tervalidasi dan akses terbatas.  
**Actor:** HSE; akses Direktur/Manager `[NEED-CONFIRMATION]`.  
**Input:** employee, birth/exam date, systolic, diastolic, MAP, blood sugar, uric acid, cholesterol, height, weight, status, suggestion.  
**Process:** validasi type/range dasar; BMI hanya saat TB/BB lengkap; MAP tetap input literal sampai formula disetujui.  
**Output:** examination record, BMI optional, status/suggestion, restricted report.  
**Status:** Draft/Final `[BASELINE]`.  
**Dependency:** M13, M01-F03/F04.  
**Source:** Audit §18.1, OA-003, AUD-GAP-011.

## M14-F01 — Approval Worklist

**Tujuan:** menyediakan mekanisme keputusan yang reusable tanpa menganggap semua approval sudah disetujui scope-nya.  
**Actor:** Requester dan approver berdasarkan jenis approval.  
**Input:** source transaction, approval type, before/after values, reason, requested by.  
**Process:** route sesuai matrix terkonfigurasi; capture decision/note/time; larang self-approval jika rule disetujui `[NEED-CONFIRMATION]`.  
**Output:** decision history dan status source.  
**Status:** Pending, Approved, Rejected, Cancelled `[BASELINE]`.  
**Dependency:** M01 role/permission/audit.  
**Source:** Price approval confirmed; approval lain baseline/blocker.

## M16-F04 — Migration Reconciliation

**Tujuan:** membuktikan data yang dimigrasikan konsisten dengan sumber tanpa menutupi anomali.  
**Actor:** Migration Admin, data owner, Manager/Direktur sign-off TBD.  
**Input:** source sheet/cell/range, staging batch, target aggregates, exception resolution.  
**Process:** compare record count, quantities and values; label accepted correction vs unchanged history; block posting for unresolved critical exceptions.  
**Output:** reconciliation report, unresolved exceptions, sign-off evidence.  
**Status:** Draft/In Review/Accepted/Rejected `[BASELINE]`.  
**Dependency:** M16-F01–F03 and target modules.  
**Source:** Audit 21, AC-001–008, AUD-GAP-010/012.

# 4. BUSINESS FLOW END-TO-END

```text
MASTER DATA
  Material / Alias / UOM / Plant / Customer / Price / Document Type
        ↓
QUOTATION [BASELINE]
        ↓
PRICE VALIDATION
        ├── sesuai master ────────────────┐
        └── deviasi → PRICE APPROVAL      │ [CONFIRMED; approver TBD]
                                           ↓
                               CUSTOMER PO / MOU
                                  PO confirmed; MOU TBD
                                           ↓
                                  DELIVERY PLANNING
                                           ↓
                                  DO / SURAT JALAN
                                           ↓
                         DELIVERY COMPLETION [event TBD]
                          ├── PO realization / remaining
                          └── stock-out candidate [timing TBD]
                                           ↓
                                  INVOICE + DOCUMENTS
                                           ↓
                                    PAYMENT RECEIPT
                                           ↓
                          PAYMENT ALLOCATION (1 → many)
                                           ↓
                              RECEIVABLE / RECONCILIATION
                                           ↓
                                  DASHBOARD & REPORT
```

Parallel operational flows:

```text
PRODUCTION SC/BP/AMP → validation/posting → INVENTORY → sales/delivery
BBM → EQUIPMENT → PRODUCTION LINK → efficiency report [formula TBD]
CSR → approval if decided → INVENTORY stock-out
HSE/EMPLOYEE/EQUIPMENT → operational and restricted reports
DOCUMENT MANAGEMENT → Quotation / PO / DO / Invoice / Payment / Letter
APPROVAL + AUDIT LOG → all controlled decisions
```

Boundary apakah aplikasi membuat transaksi resmi atau hanya merekam kejadian eksternal masih `[NEED-CONFIRMATION]`. Struktur draft, reference, audit, dan report tetap dapat dibangun; posting otomatis ditahan sampai boundary diputuskan.

# 5. PRODUCTION FLOW

## 5.1 Stone Crusher

```text
Opening/Input Reference
        ↓
Daily Production
        ↓
9 output/material:
Split 0.5 | Split 1.2 | Split 2.3 | Split 3.5 | Abu Batu |
Sirtu Jaw | Base Course A | Base Course B | Pasir Base
        ↓
Internal Consumption by destination:
Base A / Base B / Batching Plant / AMP (sesuai material)
        ↓
Production Reconciliation
        ↓
Stock Movement Candidate
        ↓
Inventory / Sales / Delivery / Report
```

- Satuan evidence: m³.
- Formula target harus berupa detail movement, bukan menyalin referensi cell Excel.
- Continuity error `C22:C26` dan `Z22:Z26` menjadi migration exception, bukan rule.

## 5.2 Batching Plant

```text
Raw Material / Receipt / Opening
  Split 1.2, Split 2.3, Pasir,
  Semen Tonasa/Tipe 1, Semen Tipe V
        ↓
Actual Material Consumption per Grade
        ↓
Concrete Production
  K-175 | K-225 | K-250 | K-300 | K-350
        ↓
Reconciliation [mix/yield rule TBD]
        ↓
Input Stock-out + Finished Output Candidate
        ↓
Inventory / PO / Delivery / Report
```

K-100/K-125/K-150/K-200/K-210/K-275 juga ditemukan pada domain penjualan/PO/invoice dan harus tersedia di master product, tetapi bukan bukti bahwa seluruh grade tersebut diproduksi pada periode BP yang diaudit. Angka konsumsi Excel adalah actual record, bukan otomatis mix-design standard.

## 5.3 Asphalt Mixing Plant

```text
Split 1.2 / Split 0.5 / Abu Batu / Pasir / Aspal Curah
        + BBM dryer+ketel / BBM genset
        ↓
AMP Production Entry
        ↓
AC-WC / AC-BC
        ↓
Reconciliation [64,8 vs 48 ton blocker]
        ↓
Inventory / Delivery / BBM Efficiency / Report
```

Bitumen dan Asphalt Emulsi tetap kandidat dari foto; keduanya tidak boleh dipakai sebagai material wajib AMP sampai dikonfirmasi.

# 6. INVENTORY FLOW

## 6.1 Current XLSX Behavior

```text
SC/BP sheet manual inputs
        ↓ formula links
Stok Material recap

Buku Besar / PO / Invoice
        - - - manual/textual relationship - - -
        tidak membuktikan posting stok terintegrasi
```

XLSX membuktikan saldo formula-driven untuk SC/BP, tetapi tidak membuktikan single-source end-to-end. AMP stock hanya memiliki label Asphalt Curah tanpa angka/formula.

## 6.2 Target System Behavior

```text
Opening Balance
 + Posted Material Receipt
 + Posted Production Output
 - Posted Production Consumption
 - Posted Delivery/Sales [event TBD]
 - Posted CSR
 ± Approved Adjustment
 = Stock Balance
```

| Mutation | Source | In/Out | Status | Confirmation Needed |
| --- | --- | --- | --- | --- |
| Opening stock | Period opening/migration | In/balance | `[EVIDENCE]` | Source/cut-off/sign-off |
| Material receipt | BP receipt/purchase candidate | In | `[EVIDENCE]` | Purchase vs receipt-only scope |
| SC production output | Validated SC record | In | `[EVIDENCE]` | Posting/validation actor |
| BP finished output | Validated BP record | In | `[EVIDENCE]` | Apakah concrete disimpan sebagai stock atau langsung delivery |
| AMP output | Validated AMP record | In | `[EVIDENCE]` | Formula total dan posting |
| Production consumption | SC internal use/BP/AMP inputs | Out | `[EVIDENCE]` | Formula/yield and posting timing |
| Sales | Sales record | Out | `[BASELINE]` | Apakah sales atau delivery yang mengurangi stok |
| Delivery/DO | Completed delivery | Out | `[CONFIRMED]` process, posting TBD | Event completion/serah-terima |
| CSR | CSR transaction | Out | `[CONFIRMED]` | Approval actor and posting status |
| Stock opname adjustment | Physical count | ± | `[BASELINE]` | Approval, period, valuation |
| Manual correction/reversal | Exception resolution | ± | `[BASELINE]` | Authority, backdate, reason |

# 7. SALES → PO → DELIVERY → INVOICE

```text
Customer
  ↓
Quotation [BASELINE; wajib/tidaknya TBD]
  ↓
Standard Price Comparison
  ├── no deviation → continue
  └── deviation → Approval [CONFIRMED; approver/threshold TBD]
  ↓
Customer PO / MOU [PO confirmed; MOU optionality TBD]
  ↓
Order / Delivery Planning [BASELINE]
  ↓
DO / Surat Jalan [CONFIRMED]
  ↓
Actual Delivery
  ├── PO realization and remaining [EVIDENCE]
  └── stock movement [event/timing TBD]
  ↓
Invoice Draft
  ├── PO/DO references when available
  └── supporting document bundle
  ↓
Tax / Account Decision [BLOCKED]
  ↓
Issued Invoice / Billing Status
  ↓
Payment Receipt
  ↓
Allocation to one/many invoices [EVIDENCE]
  ↓
Receivable + Difference Exception
```

# 8. PO MANAGEMENT

| Feature | Rule/Behavior | Status |
| --- | --- | --- |
| Create PO | Header customer, number, date, attachment | `[CONFIRMED]` concept |
| PO detail | Multiple product/ordered quantity/unit | `[EVIDENCE]` |
| Delivered quantity | Sum valid delivery allocations | `[EVIDENCE]` |
| Remaining quantity | Ordered minus delivered | `[EVIDENCE]` |
| Delivery history | Date, DO/SJ, material, qty, invoice reference | `[EVIDENCE]` partial |
| Invoice reference | Link to invoice; avoid free text where possible | `[EVIDENCE]` |
| DO reference | Structured link | `[CONFIRMED]`, XLSX explicit only Buma |
| Over-delivery warning | Display excess and prevent silent negative balance | `[REQUIREMENT CANDIDATE]` |
| Over-delivery action | Reject, allow, approve, or warning-only | `[NEED-CONFIRMATION]` |
| PO status | Draft/active/partial/fulfilled/closed/cancelled | `[NEED-CONFIRMATION]` |
| Reporting | Ordered/delivered/remaining/exception by customer/product | `[EVIDENCE]` |

MPS K-350 (-6 m³) dan RPE K-350 (-53 m³) menjadi test data exception. KSO Split 2.3 salah range 60 m³ menjadi test migrasi/reconciliation, bukan target formula.

# 9. INVOICE & PAYMENT

## 9.1 Invoice Data and Process

| Data/Process | Target | Status/Constraint |
| --- | --- | --- |
| Invoice Number | Unique business identifier; proforma placeholder tidak menjadi key | `[EVIDENCE]`; numbering final TBD |
| Customer | Structured customer reference | `[EVIDENCE]` |
| Work/Description | Deskripsi pekerjaan tetap tersedia | `[EVIDENCE]` |
| Invoice lines | Structured material/service, qty, unit, price jika applicable | `[BASELINE]`; current XLSX mostly free text |
| DPP | Stored/calculated taxable base | `[EVIDENCE]` |
| PPN | Calculation based on approved tax rule | `[EVIDENCE]`; rule `[NEED-CONFIRMATION]` |
| Total | DPP + approved tax/adjustment | `[EVIDENCE]`; rounding rule TBD |
| Tax Invoice | Number and document attachment | `[EVIDENCE]` |
| Status | Billing/payment status, not free text | `[EVIDENCE]`; transitions TBD |
| Transfer Date/Amount | Payment receipt header | `[EVIDENCE]` |
| Difference | Calculated reconciliation exception | `[EVIDENCE]`; accounting treatment TBD |
| PO/DO | Structured optional/mandatory references | `[CONFIRMED]` relation; mandatory rule TBD |
| Supporting Documents | Linked bundle | `[CONFIRMED]`; completeness TBD |

## 9.2 Payment Model

```text
PAYMENT RECEIPT
  date + amount + account + external reference
        ↓
PAYMENT ALLOCATION LINES
  Invoice A → allocated amount
  Invoice B → allocated amount
  Invoice C → allocated amount
        ↓
RECONCILIATION
  unallocated receipt + remaining invoice + difference exception
        ↓
RECEIVABLE STATUS
```

Evidence mendukung satu transfer untuk beberapa invoice. Rule cicilan, overpayment, bank charge, write-off, reversal, serta definisi `Sudah Bayar` tetap `[NEED-CONFIRMATION]`. Baseline migrasi berisi 116 invoice/proforma, tetapi angka tersebut bukan batas kapasitas sistem.

# 10. DOCUMENT MANAGEMENT

| Document | Module | Required? | Upload | Preview | Download | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Quotation/SPH | M03/M10 | `[NEED-CONFIRMATION]` | Yes | Yes | Yes | `[BASELINE]`, evidence letter type |
| Customer PO | M04/M10 | Untuk PO process; apakah wajib sebelum delivery TBD | Yes | Yes | Yes | `[CONFIRMED]` concept |
| MOU/SMOU | M04/M10 | `[NEED-CONFIRMATION]` | Yes | Yes | Yes | `[BASELINE]` from photo |
| DO/Surat Jalan | M05/M10 | Pencatatan `[CONFIRMED]`; attachment mandatory TBD | Yes/generate candidate | Yes | Yes | `[CONFIRMED]` |
| Invoice | M09/M10 | Yes untuk billing | Yes/generate candidate | Yes | Yes | `[EVIDENCE]` |
| Kuitansi/Tagihan | M09/M10 | `[NEED-CONFIRMATION]` | Yes | Yes | Yes | `[BASELINE]` |
| Faktur Pajak | M09/M10 | Sesuai tax treatment `[NEED-CONFIRMATION]` | Yes | Yes | Yes | `[EVIDENCE]` field |
| Payment proof | M09/M10 | `[NEED-CONFIRMATION]` | Yes | Yes | Yes | `[BASELINE]` |
| Hard Copy marker | M10 | Makna/mandatory TBD | Metadata/checklist | N/A | N/A | `[BASELINE]` |
| Soft Copy | M10 | File metadata | Yes | Yes | Yes | `[BASELINE]` |
| Supporting Document | Shared | Per document type TBD | Yes | Yes | Yes | `[CONFIRMED]` relation |

File storage harus menyimpan metadata akses dan versi; ketentuan tipe/ukuran file, retensi, dan legal copy termasuk blocker NFR.

# 11. BBM

## 11.1 Functional Scope

1. BBM masuk: tanggal dan liter; supplier, harga/liter, dan nomor dokumen hanya ditambahkan jika scope purchase dikonfirmasi.
2. Pemakaian BBM per alat/kendaraan dan unit SC/BP.
3. Total Crusher dan BP dihitung dari detail usage, bukan input total ganda.
4. Saldo: opening + receipt − posted usage.
5. Relasi produksi memakai period/week yang sama dan menyimpan formula version.
6. Weekly report M1–M4; definisi week/cut-off harus dikonfirmasi.
7. Zero denominator menghasilkan `N/A` dan exception, bukan `#DIV/0!`.
8. Warning untuk missing production, missing usage, negative balance, dan unmapped equipment.

## 11.2 Ratio Blocker

| Unit | Label XLSX | Formula XLSX | Target Rule |
| --- | --- | --- | --- |
| Crusher | Liter/M3 | Production/BBM | `[NEED-CONFIRMATION]`; jangan diaktifkan |
| Batching Plant | Liter/M3 | BBM/Production | Candidate sesuai label, tetap validasi |
| AMP | Liter/Ton | Kolom belum terisi | `[NEED-CONFIRMATION]` |

Pengecualian `DT 10 Roda - Sewa ABT` pada Crusher dan dua truck mixer pada BP harus dimodelkan sebagai configuration/version setelah alasan dan cakupannya disetujui; bukan hard-code tersembunyi.

# 12. EQUIPMENT & VEHICLE

| Field/Feature | Target | Status |
| --- | --- | --- |
| Equipment/Vehicle name | Master identity | `[EVIDENCE]` |
| Police Number | Unique/validated where applicable | `[EVIDENCE]` |
| Brand/Type | Descriptive field | `[EVIDENCE]` |
| Operator/Driver | Assignment/reference to employee where possible | `[EVIDENCE]` value; relation `[BASELINE]` |
| Fuel usage relation | Link usage to equipment ID | `[EVIDENCE]` |
| Delivery relation | Vehicle assignment on DO | `[BASELINE]` |
| Ownership | Optional future field | `[BASELINE] [NEED-CONFIRMATION]` |
| Capacity | Optional future field; not used for automatic kubikasi | `[BASELINE] [NEED-CONFIRMATION]` |
| Active/status | Useful master control, not evidenced | `[BASELINE]` |
| HM/KM | Out of confirmed scope | `[BASELINE] [NEED-CONFIRMATION]` |
| Ritase/kubikasi formula | Do not calculate automatically | `[NEED-CONFIRMATION]` |
| Maintenance | Not evidenced in XLSX | `[BASELINE]`, P3 unless approved |

# 13. HSE

## 13.1 WCU

| Data | Behavior | Status |
| --- | --- | --- |
| Employee | Structured reference | `[EVIDENCE]` |
| Examination/Birth date | Date validated | `[EVIDENCE]` |
| Systolic/Diastolic | Numeric entry | `[EVIDENCE]` |
| MAP | Manual value initially | `[EVIDENCE]`; formula not confirmed |
| Blood sugar/Uric acid/Cholesterol | Numeric/nullable | `[EVIDENCE]` |
| Height/Weight | Nullable numeric | `[EVIDENCE]` |
| BMI | Calculate only when valid height and weight exist | `[EVIDENCE]` quality requirement |
| Status/Suggestion | HSE input; no automatic diagnosis rule | `[EVIDENCE]` |

WCU wajib memiliki restricted permission, access audit, secure export, and retention decision. Nilai medis tidak boleh diinterpretasikan otomatis tanpa rule yang disahkan.

## 13.2 Inspection

```text
Inspection Object
  Workshop, P3K, APAR, equipment/vehicle, SC, AMP, BP, office, kitchen
        ↓
Program: frequency + scheduled date + target
        ↓
Actual: completion marker/date
        ↓
Actual Count / Cumulative Report
```

Checklist item, photo, finding, PIC, risk category, follow-up dan resolution status tetap `[BASELINE] [NEED-CONFIRMATION]`, karena tidak ditemukan dalam XLSX.

# 14. EMPLOYEE / SDM

Employee dan application user adalah entity berbeda:

| Employee Field | Status | Notes |
| --- | --- | --- |
| Name | `[EVIDENCE]` | Required candidate |
| Position | `[EVIDENCE]` | Jabatan organisasi, bukan application role |
| Birth place/date | `[EVIDENCE]` | Privacy control required |
| Address | `[EVIDENCE]` | Privacy control required |
| Join date | `[EVIDENCE]` | |
| Age | `[EVIDENCE]` in XLSX | Target sebaiknya derived from birth date; decision at design review |
| Phone/WhatsApp | `[EVIDENCE]` | Access restriction TBD |
| Unit/shift/active status | `[BASELINE]` | Not found in XLSX |
| User account link | `[BASELINE]` | Optional one-to-zero/one concept; schema not final |

Jabatan `Spv SC` dan `Spv BP` tidak otomatis menghasilkan role aplikasi Supervisor.

# 15. ADMINISTRATION / LETTER

Taxonomy evidence: `PO`, `SPH`, `SO`, `SP`, `SK`, dan `SD`.

| Feature | Input | Process | Output | Status |
| --- | --- | --- | --- | --- |
| Create Letter | type, no, date, destination/company, subject, note, user | Validate type/date/number | Letter record | `[EVIDENCE]` |
| Numbering | type/period/sequence | Uniqueness and year validation | Number or exception | `[BASELINE]`; pattern TBD |
| Letter Register | filters | Search/sort/paginate | Register | `[EVIDENCE]` |
| Attachment | file/document metadata | Access/version validation | Archived file | `[BASELINE]` |
| Archive | status/retention | Prevent accidental deletion | Archive history | `[BASELINE]` |
| Report | type/date/recipient/user | Aggregate/export | Letter report | `[EVIDENCE]` concept |

Duplicate `010/SPH...`, `011/SPH...`, dan year 2027 mismatch menjadi migration exceptions.

# 16. CSR / DONATION

```text
CSR REQUEST
  date + recipient + reason + material + quantity + document
        ↓
Approval [NEED-CONFIRMATION: required? who?]
        ↓
Completion / Posting Event [NEED-CONFIRMATION]
        ↓
STOCK MOVEMENT OUT (source = CSR)
        ↓
CSR REPORT + STOCK TRACE
```

CSR tidak menggunakan customer sales ataupun invoice secara otomatis. Valuation, document mandatory, recipient classification, dan approver tidak boleh ditentukan developer.

# 17. MASTER DATA

## 17.1 Master Catalogue and Field Status

| Master | Core Fields | Status |
| --- | --- | --- |
| Material/Product | canonical name `[CONFIRMED]`; alias `[EVIDENCE]`; category/unit/type `[EVIDENCE/BASELINE]`; active `[BASELINE]` | P0 |
| Customer | name `[EVIDENCE]`; address/contact/tax identity `[BASELINE]`; tax classification `[NEED-CONFIRMATION]` | P0 |
| Supplier | name/contact `[BASELINE]`; purchase role `[NEED-CONFIRMATION]` | P2 |
| Standard Price | material/product, value, effective period `[CONFIRMED/BASELINE detail]` | P0 |
| Unit/UOM/Plant | SC/BP/AMP; m³/ton/liter `[EVIDENCE]` | P0 |
| Equipment | name, brand/type, operator `[EVIDENCE]`; extensions `[BASELINE]` | P1 |
| Vehicle | name, police number, brand/type, driver `[EVIDENCE]` | P1 |
| Employee | audited fields `[EVIDENCE]` | P2 |
| User | login, active, role `[CONFIRMED/BASELINE detail]` | P0 |
| Role | Superadmin/Direktur/Admin/Manager/HSE `[CONFIRMED]`; permission details TBD | P0 |
| Document Type | PO/SPH/SO/SP/SK/SD plus transaction docs `[EVIDENCE/BASELINE]` | P1 |
| Payment Account | account identity/status `[BASELINE]`; tax mapping `[NEED-CONFIRMATION]` | P0-blocked |

## 17.2 Material Alias / Normalization

| Historical/Alias | Canonical Candidate | Decision |
| --- | --- | --- |
| Aggregate A / Base A | Base Course A | `[CONFIRMED]` current terminology; preserve alias |
| Aggregate B / Agregat B / Base B | Base Course B | `[CONFIRMED]` current terminology; preserve aliases |
| Bass A | Unresolved | `[NEED-CONFIRMATION]`; do not auto-map |
| Split 1-2 | Split 1.2 | `[EVIDENCE]` normalization candidate |
| Split 2-3 | Split 2.3 | `[EVIDENCE]` normalization candidate |
| Split 3-5 | Split 3.5 | `[EVIDENCE]` normalization candidate |
| Pasir Beton | Pasir or separate product | `[NEED-CONFIRMATION]` |
| Pasir | Pasir | `[CONFIRMED]` distinct from Sirtu; relation to Pasir Beton TBD |
| Pasir Base | Pasir Base | `[CONFIRMED]` separate production material |
| Semen Tipe V / Type 5 | Same candidate | `[NEED-CONFIRMATION]` |
| DuPro+ HSR | Brand/specification or material | `[NEED-CONFIRMATION]` |
| Boulder / Batu | Same candidate | `[NEED-CONFIRMATION]` |

# 18. APPROVAL

| Approval | Requester | Approver | Trigger | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Price override | Admin `[INFERENCE]` | `[NEED-CONFIRMATION]` | transaction price differs from standard | `[CONFIRMED]` need | Brief; BR-TEMP-007 |
| Stock adjustment/opname | Admin baseline | Manager baseline | physical vs system difference | `[BASELINE]` | Initial planning |
| PO deviation | Admin | `[NEED-CONFIRMATION]` | product/qty/date/other deviation TBD | `[NEED-CONFIRMATION]` | No direct evidence |
| Over-delivery | Admin/system request | `[NEED-CONFIRMATION]` | remaining would become negative | `[NEED-CONFIRMATION]` | MPS/RPE evidence |
| CSR | Admin `[INFERENCE]` | `[NEED-CONFIRMATION]` | CSR request before stock posting | `[NEED-CONFIRMATION]` | GAP-010 |
| Invoice | Admin | `[NEED-CONFIRMATION]` | issue/finalize invoice | `[NEED-CONFIRMATION]` | No approval evidence |
| Period closing/reopen | Admin/requester TBD | `[NEED-CONFIRMATION]` | close/reopen period | `[BASELINE]` | GAP-015 |

Approval engine dapat dibangun secara generic, tetapi hanya price deviation boleh diaktifkan sebagai business requirement setelah actor/threshold disahkan. Approval lain tetap feature flag/configuration-disabled.

# 19. ROLE & PERMISSION

Role aplikasi yang confirmed: **Superadmin, Direktur, Admin, Manager, HSE**. Supervisor, operator, driver, customer, dan employee position bukan role aplikasi sampai diputuskan.

Legenda matrix: `B` = proposed baseline access; `—` = tidak diberikan dalam baseline; `NC` = `[NEED-CONFIRMATION]`. Semua `B` masih harus disahkan sebelum production.

| Role | Module | View | Create | Edit | Delete | Approve | Export |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Superadmin | Platform/User/Config | B | B | B | NC | NC | B |
| Superadmin | Master Data | B | B | B | NC | NC | B |
| Superadmin | Audit Log | B | — | — | — | — | B |
| Superadmin | Business Transactions | NC | NC | NC | — | NC | NC |
| Direktur | Dashboard/Reports | B | — | — | — | — | B |
| Direktur | Sales/PO/Delivery/Production/Stock/Billing | B | — | — | — | NC | B |
| Direktur | HSE/WCU | NC | — | — | — | — | NC |
| Manager | Dashboard/Reports | B | — | — | — | — | B |
| Manager | Sales/PO/Delivery | B | NC | NC | — | NC | B |
| Manager | Production/Inventory/BBM | B | NC | NC | — | NC | B |
| Manager | Invoice/Payment/AR | B | NC | NC | — | NC | B |
| Manager | Approval Worklist | B | — | — | — | NC | B |
| Manager | HSE/WCU | NC | — | — | — | — | NC |
| Admin | Master Data | B | B | B | NC | — | B |
| Admin | Sales/Quotation/PO/Delivery | B | B | B | NC | — | B |
| Admin | Production/Inventory/CSR/BBM | B | B | B | NC | — | B |
| Admin | Invoice/Payment/Letters/Documents | B | B | B | NC | — | B |
| Admin | Approval Request | B | B | NC | — | — | — |
| Admin | HSE/WCU | — | — | — | — | — | — |
| HSE | WCU/Inspection | B | B | B | NC | NC | B |
| HSE | Employee minimum identity | B | NC | NC | — | — | NC |
| HSE | Operational Dashboard | NC | — | — | — | — | NC |
| HSE | Commercial/Billing | — | — | — | — | — | — |

Delete transaksi secara fisik tidak direkomendasikan sebagai baseline; gunakan cancel/reversal + audit. Keputusan final tetap bagian permission workshop dan audit-retention blocker.

# 20. DASHBOARD

Dashboard hanya menampilkan data **posted/validated** sesuai status final dan wajib menyediakan drill-down ke source. KPI tanpa definisi tidak boleh ditampilkan sebagai angka resmi.

## 20.1 Management Dashboard

| Widget | Source | Definition Status |
| --- | --- | --- |
| Sales value/volume | M03/M09 | Value basis dan cut-off TBD |
| Production SC/BP/AMP | M06 | Detail output evidence; reconciliation required |
| Stock balance | M07 | Posting events TBD |
| PO ordered/delivered/remaining | M04/M05 | `[EVIDENCE]` |
| Delivery volume/count | M05 | Completion status TBD |
| Invoice issued/status | M09 | Status transitions TBD |
| Payment allocated/unallocated | M09 | `[EVIDENCE]` model |
| Receivable | M09 | Aging requires due date rule TBD |
| BBM usage/balance | M08 | `[EVIDENCE]` |
| BBM ratio | M08 | Blocked until formula decision |
| HSE inspection completion | M12 | Program/actual evidence |

## 20.2 Operational Dashboard

- Production by plant/material/grade and exception.
- Current stock and movements by material/plant.
- BBM receipt, usage, balance and missing mappings.
- PO remaining and over-delivery exception.
- Delivery plan/actual and missing DO/document.

## 20.3 Approval Dashboard

- Pending request by type/age/requester.
- Price deviation value and percentage.
- Over-delivery/stock/CSR/closing exceptions only after each approval is authorized.
- Decision history and rejected/cancelled count.

# 21. REPORT MAPPING: XLSX SHEET → SYSTEM REPORT

| No | XLSX Sheet | System Report | Module | Data/Feature Generator | Status |
| ---: | --- | --- | --- | --- | --- |
| 1 | Buku Besar September | Sales & Settlement Report | M03/M09 | sales lines, price, tax, receipts/AR | `[EVIDENCE]`; boundary/tax TBD |
| 2 | Laporan Stone Crusher September | SC Daily/Period Production Report | M06 | SC output and internal consumption | `[EVIDENCE]` |
| 3 | Laporan B. Plant September | BP Production & Material Consumption Report | M06 | grade output/raw consumption | `[EVIDENCE]` |
| 4 | Laporan AMP September | AMP Production & Consumption Report | M06 | AC-WC/AC-BC and inputs | `[EVIDENCE]`; total conflict |
| 5 | Laporan BBM | Fuel Receipt, Usage & Balance Report | M08 | receipt/usage/equipment/balance | `[EVIDENCE]` |
| 6 | Selisih BBM Dan Produksi | Fuel Efficiency Report | M08 | production link and ratio version | `[EVIDENCE]`; formula blocked |
| 7 | Stok Material September | Inventory Balance & Movement Report | M07 | opening/movements/balance | `[EVIDENCE]`; posting rule TBD |
| 8 | PO PT. KSO KTP (Split 2.3) | PO Realization Report — KSO KTP filter | M04/M05 | PO line/delivery/invoice refs | `[EVIDENCE]` |
| 9 | PO PT. KSO (Concrete) | PO Realization Report — KSO Concrete filter | M04/M05 | same normalized report | `[EVIDENCE]` |
| 10 | PO PT. MPS | PO Realization & Exception Report — MPS | M04/M05 | multiple products/negative remaining | `[EVIDENCE]` |
| 11 | PO CV. Medina | PO Realization & Missing Baseline Report — Medina | M04/M05 | delivery vs PO quantities | `[EVIDENCE]` |
| 12 | PO PT. RPE | PO Realization & Exception Report — RPE | M04/M05 | delivery and over-delivery | `[EVIDENCE]` |
| 13 | PO CV. Lux Tiga Putra | PO Realization Report — Lux | M04/M05 | delivery and remaining | `[EVIDENCE]` |
| 14 | PO PT. Buma Perindahindo | PO/DO Plan vs Actual Report — Buma | M04/M05 | PO, DO plan, actual delivery | `[EVIDENCE]`; DO balance meaning TBD |
| 15 | Rekap Invoice Direct PT. AJA | Invoice, Payment Allocation & AR Report | M09 | invoice/tax/status/receipt/allocation/difference | `[EVIDENCE]` |
| 16 | Rekap Surat PT. AJA | Outgoing Letter Register | M10 | type/number/date/recipient/subject/user | `[EVIDENCE]` |
| 17 | Rekap Surat PT. AJA Di Pisah | Letter Report by Type | M10 | categorized register SO/SPH/SP/SK/SD | `[EVIDENCE]` |
| 18 | Data Alat & Kendaraan | Equipment & Vehicle Report | M11 | equipment/vehicle/operator/driver | `[EVIDENCE]` |
| 19 | Hasil WCU | Restricted WCU Report | M12 | exam/vitals/lab/BMI/status/suggestion | `[EVIDENCE]` |
| 20 | Inspek Alat Dan Kendaraan | Inspection Program vs Actual Report | M12 | object/date/program/actual/target | `[EVIDENCE]` |
| 21 | Daftar Pekerja PT AJA | Employee Register | M13 | employee identity/employment/contact | `[EVIDENCE]` |

Report requirements common to all: date/period filter where applicable, source drill-down, role-based access, deterministic totals, export with generated timestamp/user, and explicit `N/A` for unavailable metrics. Scheduling/email distribution is not confirmed.

# 22. DATA FLOW

```text
                              ┌────────────────────┐
                              │ M02 MASTER DATA    │
                              └─────────┬──────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              ↓                         ↓                          ↓
       M03 SALES/QUO             M06 PRODUCTION              M11 EQUIPMENT
              ↓                   SC / BP / AMP                    ↓
       M04 CUSTOMER PO                   ↓                       M08 BBM
              ↓                       M07 INVENTORY ←──────────────┘
       M05 DELIVERY/DO                   ↑
              ├─────────────────────────┤
              ↓                         ↑
       M09 INVOICE                 M07 CSR
              ↓
       PAYMENT RECEIPT
              ↓
       PAYMENT ALLOCATION
              ↓
         RECEIVABLE
              ↓
       M15 REPORT/DASHBOARD
```

Cross-cutting relationships:

```text
M14 APPROVAL  → Price / PO exception / Stock / CSR / Invoice / Closing (as approved scope)
M10 DOCUMENT  → Quotation / PO / DO / Invoice / Payment / Letter
M01 AUDIT     → All mutation, decision, export, configuration and sensitive access
M13 EMPLOYEE  → WCU / Operator-Driver assignment; not automatically User
M12 HSE       → Employee + Equipment/Inspection object
M16 MIGRATION → Staging/Cleansing → every target master and transaction module
```

# 23. DEPENDENCY MATRIX

| Module/Capability | Depends On | Used By |
| --- | --- | --- |
| Authentication/User | Role/Permission | All modules |
| Audit/Period | User, configuration | All controlled transactions/reports |
| Material/Product | UOM, plant, alias | Sales, PO, Production, Inventory, Delivery, CSR |
| Customer | - | Quotation, PO, Delivery, Invoice, AR |
| Supplier | - | Material receipt/purchase candidate |
| Standard Price | Material | Quotation, Sales, Price Approval |
| Payment Account | Configuration/approved tax rule | Payment, reconciliation |
| Document Type | Numbering configuration | Quotation, PO, DO, Invoice, Letter |
| Sales/Quotation | Customer, Material, Price | PO/Approval, Reporting |
| Customer PO | Customer, Material, Documents | Delivery, Invoice, Reporting |
| Delivery/DO | PO, Material, Vehicle, Documents | PO realization, Inventory, Invoice |
| Production | Material, Plant, Period | Inventory, BBM, Reporting |
| Inventory | Material, Period, posted sources | Sales availability, Reports, Closing |
| CSR | Material, Inventory, optional Approval | Stock ledger, CSR report |
| BBM | Equipment, Production, Period | Fuel/efficiency report |
| Invoice | Customer, PO/DO policy, tax rule, Documents | Payment, Receivable |
| Payment | Invoice, Payment Account | Allocation, Receivable, Reports |
| Letter | Document Type/Numbering, User | Administration report |
| Equipment/Vehicle | Employee optional | BBM, Delivery, Inspection |
| WCU | Employee, restricted permission | HSE report |
| Inspection | Object/equipment, HSE user | HSE report |
| Approval | User/Role, Audit, source transaction | Sales/Inventory/PO/CSR/Closing |
| Reports/Dashboard | Validated/posted module data | Management/Operations |
| Migration | Master mappings, exception decisions | All target modules |

# 24. PRIORITAS DEVELOPMENT

## P0 — Foundation / Core

- Authentication, user, role/permission shell, audit log: seluruh transaksi membutuhkan identity dan traceability.
- Material/alias/UOM/plant/customer/price master: dependency semua proses utama.
- Migration staging, exception register, reconciliation: workbook mengandung error dan tidak boleh diimport langsung.
- Sales price validation/approval shell: deviasi harga telah confirmed.
- Customer PO, PO lines, realization, DO/SJ: inti kontrol volume dan delivery.
- Production SC/BP/AMP entry + reconciliation: sumber operasional dan stock candidates.
- Inventory ledger/opening/balance: pusat integrasi; posting otomatis tetap blocked sampai event disetujui.
- Invoice/receipt/allocation/reconciliation: evidence aktual dan berdampak langsung pada AR.
- Blocker decisions: tax/account, stock events, formula production/fuel, over-delivery, approver, payment rules.

## P1 — Core Business

- Quotation, delivery plan/history, production/PO reports.
- CSR, receipt, stock opname/adjustment setelah workflow diputuskan.
- BBM lengkap, equipment/vehicle core, fuel-production link.
- Document bundle, archive, numbering validation.
- Receivable register, approval dashboard, report catalogue.
- Period/closing shell dan configuration, walau activation menunggu decision.

## P2 — Supporting

- Letter administration, employee register, WCU, inspection program/actual.
- Management/operational dashboard dan export snapshot.
- Supplier master jika purchase scope dipilih.
- Invoice/closing approval jika disetujui.

## P3 — Enhancement

- Equipment ownership/capacity/HM/KM/maintenance.
- Inspection checklist/foto/finding/PIC/risk/follow-up.
- Scheduled report, notification channels, advanced analytics, offline/PWA jika kemudian dibutuhkan.

# 25. DEVELOPMENT PHASE

## Phase 0 — Decision, UX Discovery, and Technical Foundation

- Resolve or formally defer critical blockers; publish decision log and rule versions.
- Confirm navigation, actor journeys, responsive frontend, security baseline, environments, CI/CD, storage, backup and observability.
- Build authentication, base authorization, audit framework, configuration, feature flags and error handling.
- Define conceptual data dictionary and API contract; do not finalize blocked columns/rules.

**Exit:** approved scope/MVP, permission draft, blocker owners/dates, foundation deployable to test.

## Phase 1 — Master Data and Migration Staging

- Material/product, aliases, UOM, plant, customer, standard price, document type.
- Equipment/vehicle base references needed by downstream modules.
- Workbook staging, cleansing rules, exception register, baseline reconciliation templates.

**Exit:** canonical master approved sufficiently for transaction testing; unresolved aliases isolated.

## Phase 2 — Commercial, Price Approval, and Customer PO

- Sales/quotation shell, multi-line data, price validation, approval worklist.
- Customer PO/MOU shell, PO details, ordered/delivered/remaining calculation and exception flags.
- Document upload/reference for quotation/PO.

**Exit:** approved price can feed PO; PO totals are traceable from details.

## Phase 3 — Production and Inventory Core

- Separate SC, BP, AMP forms and reconciliation.
- Opening balance, movement ledger, stock card and balance engine.
- Implement posting adapters but keep blocked rules behind feature flags until signed decisions.

**Exit:** production can be entered/validated; test movements are traceable; no XLSX anomaly copied.

## Phase 4 — Delivery, Inventory Posting, and CSR

- Delivery planning, DO/SJ, vehicle assignment, completion and PO realization.
- Activate approved stock event rules; CSR and optional approval; stock opname/adjustment if approved.

**Exit:** PO→delivery→stock trace passes UAT for approved scenarios and exceptions.

## Phase 5 — Billing, Payment, and Receivable

- Invoice draft/issue, tax configuration after decision, document checklist.
- Payment receipt, multi-invoice allocation, reconciliation/difference and AR register.

**Exit:** delivery/PO references can be billed; combined transfer scenario reconciles; tax test cases signed.

## Phase 6 — BBM and Operational Assets

- BBM receipt/usage/balance, equipment relation, production link.
- Ratio engine only after formula/exclusion decision; weekly report and exceptions.

**Exit:** fuel balance reconciles and ratio displays formula/version/source.

## Phase 7 — Administration, HSE, and Employee

- Letter taxonomy/register/numbering/archive.
- Employee registry; WCU with restricted access; inspection program/actual.

**Exit:** privacy/permission tests pass; 21-sheet replacement scope is functionally represented.

## Phase 8 — Reports and Dashboards

- Implement 21-sheet report mapping, management/operational/approval dashboard, exports and drill-down.
- Validate every KPI against signed definition and reconciled test data.

**Exit:** report totals reconcile to accepted migration/UAT dataset.

## Phase 9 — Migration, UAT, Training, and Go-Live

- Execute trial migration, cleansing/sign-off, role-based UAT, performance/security testing.
- Prepare SOP, user training, support/escalation, cut-over, rollback, backup restore test and hypercare.

**Exit:** signed UAT/migration/cut-over approval, recoverability proven, production readiness accepted.

# 26. FEATURE BACKLOG

Backlog status: `Ready` = dapat dirinci/dibangun tanpa keputusan bisnis tambahan; `Partial` = shell/core dapat dibangun tetapi sebagian rule belum final; `Blocked` = perilaku bisnis tidak boleh diaktifkan sebelum keputusan; `Planned` = fase pendukung. Nama database adalah conceptual data need, bukan schema final. API berarti resource/operation yang harus tersedia, bukan route atau code final.

## 26.1 Phase 0–1 — Foundation, Master, Migration

| ID | Phase | Module | Feature | Backend | Frontend | Database Need | API Need | Priority | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M01-F01 | 0 | Platform | Authentication | session/auth policy | login/logout/error | user/session concept | login/logout/me | P0 | - | Ready |
| M01-F02 | 0 | Platform | User Management | validation/status/service | list/form/detail | user-role link | user resource/status | P0 | M01-F03 | Partial |
| M01-F03 | 0 | Platform | Role & Permission | authorization policy | permission matrix UI | role/permission mapping | role/permission resource | P0 | - | Blocked matrix |
| M01-F04 | 0 | Platform | Audit Log | event capture/query | searchable audit viewer | audit event/change metadata | audit query/export | P0 | all modules | Ready shell |
| M01-F05 | 0/8 | Platform | Period & Closing | period lock checks | period list/action | period/close history | period/close/reopen | P1 | M14 | Blocked |
| M01-F06 | 0 | Platform | System Configuration | config validation/version | settings form | config/version | config read/update | P1 | M01-F03 | Partial |
| M02-F01 | 1 | Master | Material & Product | CRUD/duplicate rules | list/form/detail | material/product concept | material resource | P0 | M02-F03 | Ready core |
| M02-F02 | 1 | Master | Alias/Normalization | mapping/validation | mapping workbench | material alias/decision | alias/map/unmap | P0 | M02-F01 | Partial |
| M02-F03 | 1 | Master | UOM & Plant | reference management | list/form | UOM/plant | reference resource | P0 | - | Ready |
| M02-F04 | 1 | Master | Customer | CRUD/search | list/form/detail | customer/tax attrs TBD | customer resource | P0 | - | Partial tax |
| M02-F05 | 7 | Master | Supplier | CRUD/search | list/form | supplier | supplier resource | P2 | scope decision | Blocked scope |
| M02-F06 | 1 | Master | Standard Price | effective price lookup | price list/history | price/effective period | price resource/lookup | P0 | Material | Ready core |
| M02-F07 | 1/5 | Master | Payment Account | account validation | account list/form | payment account/tax mapping | account resource | P0 | tax decision | Blocked |
| M02-F08 | 1 | Master | Document Type & Numbering | type/uniqueness service | type/pattern form | type/sequence/version | type/next-number | P1 | config decision | Partial |
| M16-F01 | 1 | Migration | Import Staging | parse/retain lineage/no posting | batch upload/result | import batch/source row/cell | batch/upload/status | P0 | masters | Ready |
| M16-F02 | 1 | Migration | Cleansing & Mapping | transform decision workflow | mapping queue | cleansing decision/map | queue/resolve | P0 | M02-F02 | Partial |
| M16-F03 | 1 | Migration | Exception Register | validation/severity/status | exception workbench | exception/resolution | exceptions/resolve | P0 | staging | Ready |
| M16-F04 | 1/9 | Migration | Reconciliation | count/amount/qty comparison | reconciliation dashboard | reconciliation result | reconcile/report | P0 | target modules | Ready framework |
| M16-F05 | 9 | Migration | Cut-off/Sign-off | batch lock/sign-off | approval summary | cut-off/sign-off | sign-off action | P0 | blocker decision | Blocked |

## 26.2 Phase 2–4 — Sales, PO, Production, Inventory, Delivery

| ID | Phase | Module | Feature | Backend | Frontend | Database Need | API Need | Priority | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M03-F01 | 2 | Sales | Quotation | header/line validation | list/form/detail/print | quotation/line | quotation resource | P1 | masters | Partial |
| M03-F02 | 2 | Sales | Price Validation | price compare/deviation | inline price indicator | price comparison snapshot | validate-price | P0 | M02-F06 | Ready |
| M03-F03 | 2 | Sales | Override Request | request/hold decision | reason/approval state | approval source/snapshot | request-approval | P0 | M14 | Blocked approver |
| M03-F04 | 2 | Sales | Sales Register | multi-line/tax/settlement validation | list/form/detail/filter | sale/line/tax snapshot | sales resource | P0 | boundary decision | Blocked |
| M03-F05 | 5 | Sales | Settlement Snapshot | map legacy buckets | reconciliation view | settlement snapshot | settlement resource | P1 | M09 | Partial |
| M04-F01 | 2 | PO | Create PO/MOU | header/number/document | list/form/detail | customer order/document refs | PO resource | P0 | customer/doc | Ready PO |
| M04-F02 | 2 | PO | PO Product Detail | qty/unit validation | editable line items | PO line | PO-line resource | P0 | material/UOM | Ready |
| M04-F03 | 2/4 | PO | Realization/Remaining | aggregate delivery allocations | progress/detail | PO-delivery allocation | realization query | P0 | M05 | Ready engine |
| M04-F04 | 4 | PO | Over-delivery Exception | detect/hold/warn config | warning/decision state | PO exception | exception/action | P0 | rule/approval | Blocked |
| M04-F05 | 4/8 | PO | PO Report | filter/aggregate/export | report/detail | report projection | PO report/export | P1 | F01–F04 | Partial |
| M06-F01 | 3 | Production | SC Daily Input | detail validation/total | daily grid/form/detail | production header/material detail | SC production resource | P0 | master/period | Partial formulas |
| M06-F02 | 3 | Production | SC Internal Use | destination validation | per-material destination form | consumption detail/destination | SC consumption | P0 | F01/M07 | Ready evidence |
| M06-F03 | 3 | Production | BP Daily Input | grade/consumption validation | grade-oriented form | BP batch/grade/consumption | BP production resource | P0 | master/period | Partial mix |
| M06-F04 | 3 | Production | AMP Daily Input | input/output validation | product/input form | AMP batch/input/output | AMP production resource | P0 | formula decision | Blocked total rule |
| M06-F05 | 3 | Production | Reconciliation | compare detail/total/exceptions | reconciliation panel | production exception/validation | validate/post/reopen | P0 | F01–F04 | Partial authority |
| M06-F06 | 3/8 | Production | Period Report | weekly/monthly aggregates | filters/report/drill | report projection | production report | P1 | week rule | Partial |
| M07-F01 | 3 | Inventory | Opening Balance | import/manual validation | opening form/batch | opening balance/source | opening balance resource | P0 | period/master | Partial sign-off |
| M07-F02 | 3 | Inventory | Movement Ledger | posting/idempotency/reversal | ledger/detail/filter | stock movement/source link | movement query/post/reverse | P0 | event decisions | Partial shell |
| M07-F03 | 3/4 | Inventory | Material Receipt | receipt validation | list/form/detail | receipt/line/document | receipt resource | P1 | purchase scope | Partial |
| M07-F04 | 3 | Inventory | Production Posting | adapter/reversal | posting status/error | posting reference/movements | production post/reverse | P0 | production rules | Blocked |
| M07-F05 | 4 | Inventory | Delivery/Sales Posting | adapter/reversal | posting state | source movement link | delivery post/reverse | P0 | stock event | Blocked |
| M07-F06 | 4 | Inventory | CSR | transaction/posting adapter | list/form/detail | CSR/line/recipient | CSR resource/post | P1 | approval decision | Partial |
| M07-F07 | 4 | Inventory | Opname/Adjustment | difference/request/post | count/adjustment form | count/adjustment/approval | opname/adjust | P1 | rule/approval | Blocked |
| M07-F08 | 3/4 | Inventory | Balance & Card | deterministic aggregation | balance/card/drill | balance projection | stock balance/card | P0 | ledger | Ready after ledger |
| M05-F01 | 4 | Delivery | Delivery Planning | plan validation | calendar/list/form | delivery plan | plan resource | P1 | PO | Partial |
| M05-F02 | 4 | Delivery | DO/Surat Jalan | numbering/line/print | form/detail/print | DO/header/line/docs | DO resource | P0 | PO/master/doc | Ready core |
| M05-F03 | 4 | Delivery | Vehicle Assignment | assignment validation | vehicle/driver selector | delivery-vehicle assignment | assignment operation | P1 | M11 | Partial |
| M05-F04 | 4 | Delivery | Completion | actual/status/post trigger | completion form | delivery actual/status | complete/cancel | P0 | event rule | Blocked |
| M05-F05 | 4/8 | Delivery | History | filters/trace/export | history/timeline | report projection | delivery report | P1 | F04 | Partial |

## 26.3 Phase 5–6 — Billing, BBM, Equipment

| ID | Phase | Module | Feature | Backend | Frontend | Database Need | API Need | Priority | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M09-F01 | 5 | Billing | Invoice Draft | header/line/ref validation | list/form/detail | invoice/line/source refs | invoice resource | P0 | PO/DO/doc | Partial mandatory refs |
| M09-F02 | 5 | Billing | Tax & Total | versioned calculation/rounding | tax preview/explanation | tax snapshot/rule version | calculate-total | P0 | tax decision | Blocked |
| M09-F03 | 5 | Billing | Tax/Supporting Docs | completeness metadata | document checklist | invoice document links | invoice-doc operations | P1 | M10 | Partial |
| M09-F04 | 5 | Billing | Invoice Status | transition validation | status/action/history | billing status history | issue/status/cancel | P0 | status decision | Blocked |
| M09-F05 | 5 | Payment | Payment Receipt | amount/account/reference validation | list/form/detail | payment receipt | payment resource | P0 | account master | Partial |
| M09-F06 | 5 | Payment | Allocation | allocation validation/post/reverse | allocation workbench | allocation lines | allocate/reverse | P0 | receipt/invoice | Partial rules |
| M09-F07 | 5 | Payment | Reconciliation | remaining/difference/exception | reconciliation panel | difference/exception | reconcile query/action | P0 | allocation rules | Partial |
| M09-F08 | 5/8 | AR | Receivable Register | balance/status/filter | AR list/detail/export | receivable projection | AR report | P1 | invoice/allocation | Partial aging |
| M08-F01 | 6 | BBM | BBM Receipt | validation/posting | list/form/detail | fuel receipt | fuel receipt resource | P1 | period | Ready core |
| M08-F02 | 6 | BBM | Equipment Usage | equipment/unit validation | daily usage grid | fuel usage/equipment | usage resource | P1 | M11 | Ready core |
| M08-F03 | 6 | BBM | Fuel Balance | aggregation/reversal | balance/card | fuel movement/balance | balance query | P1 | F01/F02 | Ready |
| M08-F04 | 6 | BBM | Production Link | period mapping | production reference view | KPI source snapshot | production-link query | P1 | M06 | Partial week rule |
| M08-F05 | 6 | BBM | Ratio/Exception | versioned formula/zero handling | formula/exclusion/exception view | KPI config/result | calculate-ratio | P1 | rule decision | Blocked |
| M08-F06 | 6/8 | BBM | Weekly Report | weekly aggregates/export | report/drill | report projection | fuel report | P1 | week/ratio rules | Partial |
| M11-F01 | 1/6 | Asset | Equipment Master | CRUD/search | list/form/detail | equipment | equipment resource | P1 | - | Ready core |
| M11-F02 | 1/6 | Asset | Vehicle Master | CRUD/police no validation | list/form/detail | vehicle | vehicle resource | P1 | - | Ready core |
| M11-F03 | 6/7 | Asset | Operator Assignment | effective assignment | assignment UI/history | asset-employee assignment | assign/unassign | P2 | Employee | Planned |
| M11-F04 | 6 | Asset | Fuel Relation | mapping validation | usage timeline | equipment-fuel link | asset fuel history | P1 | BBM | Ready |
| M11-F05 | future | Asset | Extended Attributes | optional validation | extended profile | optional attributes | extended asset resource | P3 | scope decision | Blocked scope |

## 26.4 Phase 7–8 — Documents, Administration, HSE, SDM, Reports

| ID | Phase | Module | Feature | Backend | Frontend | Database Need | API Need | Priority | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M10-F01 | 2/5/7 | Document | Document Bundle | upload/access/version | uploader/checklist/preview | document/link/version | upload/link/download | P1 | storage/type | Partial mandatory |
| M10-F02 | 7 | Letter | Create Letter | field/number validation | list/form/detail | letter/type/user | letter resource | P2 | doc type | Ready core |
| M10-F03 | 7 | Letter | Number Validation | uniqueness/sequence/year checks | number preview/exception | sequence/reservation | reserve/validate-number | P1 | numbering rule | Partial |
| M10-F04 | 7 | Letter | Register/Search | query/filter | register/filter | search projection | letter query | P2 | F02 | Ready |
| M10-F05 | 2/5/7 | Document | Archive/Preview | authorization/stream/archive | preview/download/archive | archive metadata | file access/archive | P1 | storage/permission | Partial retention |
| M10-F06 | 8 | Document | Document Report | completeness/filter/export | report | report projection | document report | P2 | rules | Planned |
| M12-F01 | 7 | HSE | WCU Examination | sensitive validation/access | restricted form/detail | WCU exam | WCU resource | P2 | Employee/permission | Partial privacy |
| M12-F02 | 7 | HSE | BMI Validation | nullable calculation | derived display/error | calculation result | validate/calculate | P2 | WCU | Ready |
| M12-F03 | 7 | HSE | Status/Suggestion | controlled nullable fields | assessment form | assessment/status | update assessment | P2 | WCU | Ready core |
| M12-F04 | 7 | HSE | Inspection Program | schedule/target validation | calendar/grid | inspection plan/object | plan resource | P2 | object master | Ready core |
| M12-F05 | 7 | HSE | Inspection Actual | completion/count | actual entry/grid | inspection actual | actual resource | P2 | program | Ready core |
| M12-F06 | future | HSE | Detail Extension | workflow/file/finding | checklist/photo/follow-up | finding/action/file | inspection details | P3 | scope decision | Blocked scope |
| M12-F07 | 7/8 | HSE | Restricted Reports | scoped query/export audit | restricted reports | report/access events | HSE report/export | P2 | privacy rule | Partial |
| M13-F01 | 7 | SDM | Employee Registry | CRUD/privacy validation | list/form/detail | employee | employee resource | P2 | - | Ready core |
| M13-F02 | 7 | SDM | User Link | optional association | link/unlink UI | employee-user link | link/unlink | P2 | User | Partial |
| M13-F03 | 8 | SDM | Employee Report | filter/export | report | report projection | employee report | P2 | registry | Ready |
| M14-F01 | 2 | Approval | Worklist | generic request/decision/audit | inbox/detail/history | approval/decision | worklist/decide | P0 | roles | Partial matrix |
| M14-F02 | 2 | Approval | Price Approval | price-specific trigger/hold | comparison/decision | price approval snapshot | price decision | P0 | approver decision | Blocked actor |
| M14-F03 | 4 | Approval | Stock Adjustment | stock-specific trigger | adjustment decision | approval source | stock decision | P1 | approval scope | Blocked |
| M14-F04 | 4 | Approval | PO/Over-delivery | excess-specific trigger | exception decision | approval source | PO exception decision | P1 | policy | Blocked |
| M14-F05 | 4 | Approval | CSR Approval | CSR trigger | CSR decision | approval source | CSR decision | P1 | policy | Blocked |
| M14-F06 | 5/8 | Approval | Invoice/Closing | finalize/close trigger | decision UI | approval source | invoice/close decision | P2 | policy | Blocked |
| M15-F01 | 8 | Dashboard | Management | authorized aggregates/cache | responsive cards/drill | KPI projection/version | management metrics | P2 | KPI decisions | Partial |
| M15-F02 | 8 | Dashboard | Operational | scoped aggregates | plant/operations view | KPI projection | operational metrics | P2 | posted data | Partial |
| M15-F03 | 2/8 | Dashboard | Approval | pending/aging query | worklist summary | approval projection | approval metrics | P1 | M14 | Ready shell |
| M15-F04 | 8 | Reports | Report Catalogue | filter/aggregate/export | catalogue/report viewer | report projections | report/query/export | P1 | all modules | Partial per report |
| M15-F05 | 8 | Reports | Export/Snapshot | immutable export metadata | export action/history | export snapshot/audit | export/status/download | P2 | F04/audit | Planned |

## 26.5 Non-Feature Engineering Backlog

| ID | Phase | Work Item | Backend/Infra | Frontend | Data/API | Priority | Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ENG-001 | 0 | Environment & CI/CD | dev/test/staging/prod pipeline, secrets, rollback | build pipeline | migration/version policy | P0 | hosting decision | Ready design |
| ENG-002 | 0 | Security Baseline | password/session/rate limit/input/file security | secure session/error UX | API auth/error contract | P0 | NFR decision | Partial |
| ENG-003 | 0 | Observability | structured logs, metrics, alerts, tracing | error reference ID | health endpoints | P0 | infra | Ready design |
| ENG-004 | 0/9 | Backup & Recovery | backup/restore/runbook/test | admin status optional | RPO/RTO evidence | P0 | policy decision | Blocked targets |
| ENG-005 | all | Test Automation | unit/service/integration/security/performance | component/E2E/accessibility | contract and data tests | P0 | acceptance rules | Ongoing |
| ENG-006 | 0–8 | UX Design System | validation patterns, responsive layouts | reusable forms/tables/status/error | standard API states | P1 | user workflow | Ready |
| ENG-007 | 9 | Training & SOP | admin/support/runbook | role-based guide | data-entry/migration SOP | P0 | stable UAT | Planned |
| ENG-008 | 9 | Cut-over & Hypercare | release/rollback/support triage | notices/help | reconciliation/go-live log | P0 | sign-offs | Planned |

# 27. ACCEPTANCE CRITERIA P0/P1

Kriteria di bawah merupakan minimum. Untuk feature blocked, acceptance development berarti shell aman tersedia dan perilaku bisnis yang belum disetujui **tidak aktif**; production acceptance baru dapat ditutup setelah decision record disetujui.

## M01 — Platform

| Feature ID | Acceptance Criteria |
| --- | --- |
| M01-F01 | User valid dapat login/logout; user nonaktif ditolak; sesi berakhir sesuai kebijakan; kegagalan tidak membocorkan detail sensitif. |
| M01-F02 | Superadmin dapat membuat, melihat, mengubah status akun dan menetapkan role; perubahan tercatat; identitas employee tidak wajib sama dengan user. |
| M01-F03 | Akses backend dan frontend mengikuti permission yang sama; direct API access tetap ditolak; default-deny berlaku; matrix final dapat dikonfigurasi tanpa code rule bisnis. |
| M01-F04 | Create/edit/cancel/approve/post/reverse/config/export menghasilkan event berisi actor, time, source dan before/after yang relevan; log tidak dapat diedit user biasa. |
| M01-F05 | Periode terbuka dapat dipakai; transaksi pada periode tertutup ditolak setelah rule aktif; close/reopen tercatat; sebelum decision, action closing disabled. |
| M01-F06 | Hanya role berizin dapat mengubah konfigurasi; perubahan berversi dan diaudit; invalid value ditolak; secret tidak tampil sebagai plain value. |

## M02 — Master Data

| Feature ID | Acceptance Criteria |
| --- | --- |
| M02-F01 | Admin dapat list/create/detail/edit/nonaktifkan material; duplicate canonical terdeteksi; inactive item tidak tersedia untuk transaksi baru; histori tetap terbaca. |
| M02-F02 | Setiap alias dapat dipetakan, ditolak atau ditandai unresolved; `Bass A` tidak auto-map; mapping menyimpan source dan decision actor; transaksi baru memakai canonical value. |
| M02-F03 | m³, ton, liter serta plant SC/BP/AMP tersedia; unit invalid ditolak; perubahan referensi tidak merusak histori. |
| M02-F04 | Customer dapat dicari/dipilih; variasi nama migrasi dapat ditandai; atribut pajak tidak menghitung PPN sebelum rule disetujui. |
| M02-F06 | Harga disimpan dengan material dan effective context; lookup menghasilkan harga pembanding yang dapat ditelusuri; perubahan harga tidak mengubah snapshot transaksi lama. |
| M02-F07 | Payment account shell mendukung active/inactive dan audit; mapping account-to-tax disabled sampai decision; account receipt tervalidasi saat feature diaktifkan. |
| M02-F08 | Tipe dokumen dapat dikelola; nomor duplicate/year mismatch terdeteksi; pola nomor dapat berversi; auto-number tidak diaktifkan sebelum format disetujui. |

## M03 — Sales & Quotation

| Feature ID | Acceptance Criteria |
| --- | --- |
| M03-F01 | Admin dapat membuat header dan multi-line quotation; customer/material/qty/price tervalidasi; total dapat ditinjau; status/konversi yang belum disetujui tidak dipaksakan. |
| M03-F02 | Sistem menampilkan standard price, offered price dan deviation secara deterministik; snapshot price tersimpan; no-standard-price menjadi exception jelas. |
| M03-F03 | Deviasi membuat request beralasan; pending/rejected tidak dapat melewati gate yang disetujui; decision dan actor diaudit; approver belum dikonfigurasi berarti request tidak auto-approved. |
| M03-F04 | Form mendukung tanggal, customer, multi-item qty/price/total, sewa, PPN field dan reference; tax/posting disabled sampai boundary/rule disetujui; input dapat ditelusuri. |
| M03-F05 | Data legacy Cash/BNI/BNI PT AJA/Piutang dan tanggal transfer dapat dipresentasikan tanpa dianggap model payment final; nilai dapat direkonsiliasi ke source. |

## M04 — Customer PO

| Feature ID | Acceptance Criteria |
| --- | --- |
| M04-F01 | Admin dapat membuat PO customer dengan nomor/tanggal/customer dan attachment; nomor tervalidasi; MOU dapat disimpan sebagai jenis/reference tanpa diwajibkan. |
| M04-F02 | PO memiliki satu/lebih product lines dengan ordered qty/unit; qty nonpositive ditolak; perubahan line setelah realization mengikuti policy/audit. |
| M04-F03 | Delivered berasal dari allocation delivery detail; remaining = ordered − delivered; user dapat drill-down; perhitungan tidak memakai manual range. |
| M04-F04 | Sistem mendeteksi remaining negatif sebelum/ketika completion; menampilkan excess; tidak memilih reject/allow sendiri; policy-disabled state jelas dan diaudit. |
| M04-F05 | Report memfilter customer/product/date/PO/status candidate; menampilkan ordered/delivered/remaining/exception; total sama dengan detail; dapat diekspor oleh role berizin. |

## M05 — Delivery

| Feature ID | Acceptance Criteria |
| --- | --- |
| M05-F01 | Admin dapat membuat rencana dari PO/item/qty/date; perubahan terlacak; rencana tidak mengubah PO/stock sebelum completion event. |
| M05-F02 | Admin dapat membuat DO/SJ dengan nomor, date, customer, item, qty dan references; number duplicate ditolak; preview/download tersedia sesuai permission; perubahan diaudit. |
| M05-F03 | Kendaraan/driver dapat dipilih dari master; assignment tersimpan per delivery; sistem tidak menghitung kubikasi dari ritase sebelum rule disetujui. |
| M05-F04 | Actual delivery dapat dicatat; completion menghasilkan candidate realization; stock posting disabled sampai event disetujui; cancel/reversal memiliki jejak. |
| M05-F05 | History menampilkan PO/DO/date/item/planned/actual/vehicle/invoice refs; filter dan drill-down bekerja; total merekonsiliasi delivery detail. |

## M06 — Production

| Feature ID | Acceptance Criteria |
| --- | --- |
| M06-F01 | Admin dapat mencatat tanggal dan production untuk 9 material SC; unit m³; numeric validation; total berasal dari detail; record memiliki source/status/audit. |
| M06-F02 | Pemakaian internal dicatat per material dan destination Base A/Base B/BP/AMP yang valid; total consumption dapat ditelusuri; tidak ada hidden subtraction. |
| M06-F03 | Admin dapat mencatat output K-175/K-225/K-250/K-300/K-350 dan actual raw consumption; date-as-number ditolak; total berasal dari detail; mix design tidak auto-derived dari Excel. |
| M06-F04 | Form mencatat input AMP dan AC-WC/AC-BC; sistem menandai mismatch; formula total/posting disabled sampai 64,8 vs 48 resolution; no silent correction. |
| M06-F05 | Reconciliation memperlihatkan input/output/detail/total/exceptions; hanya record sesuai authority dapat divalidasi/post; reopen/reversal diaudit. |
| M06-F06 | Report memfilter plant/material/grade/period; M1–M4 hanya tampil setelah definition configured; monthly total sama dengan accepted details; anomaly ditampilkan. |

## M07 — Inventory & CSR

| Feature ID | Acceptance Criteria |
| --- | --- |
| M07-F01 | Opening balance memuat material/plant/period/qty/source; duplicate opening pada scope sama dicegah; imported balance memerlukan reconciliation/sign-off. |
| M07-F02 | Setiap posted mutation mempunyai unique source/type/direction/qty/time/actor; duplicate posting dicegah; balance dapat direkonstruksi; koreksi memakai reversal. |
| M07-F03 | Receipt mencatat date/material/qty/source/doc optional; stock-in hanya terjadi pada approved posting event; purchase fields tidak diwajibkan tanpa scope decision. |
| M07-F04 | Satu production source tidak dapat dipost dua kali; input/output movements seimbang terhadap accepted detail; blocked formulas tidak menghasilkan movement; reversal traceable. |
| M07-F05 | Delivery/sales source hanya posting pada event configured; sistem tidak mengurangi stok ganda; cancel/reversal mengembalikan saldo secara traceable. |
| M07-F06 | Admin dapat membuat CSR dengan recipient/reason/material/qty; completion menghasilkan source-linked stock-out setelah policy terpenuhi; approver kosong tidak berarti auto-approved. |
| M07-F07 | Physical count menghasilkan difference dan reason; adjustment tidak posting sebelum policy; before/after/approver/reversal diaudit. |
| M07-F08 | Kartu stok menampilkan opening, tiap in/out, source dan running balance; saldo filter period/material/plant konsisten dengan ledger dan report. |

## M08 — BBM

| Feature ID | Acceptance Criteria |
| --- | --- |
| M08-F01 | Admin dapat mencatat date/liter/source; liter nonpositive ditolak; receipt muncul pada fuel ledger; field supplier/price tidak diwajibkan. |
| M08-F02 | Usage dicatat per equipment/unit/date/liter; unmapped equipment ditolak/ditandai; total SC/BP berasal dari detail. |
| M08-F03 | Balance = opening + receipts − posted usage; running balance traceable; negative balance menjadi exception; reversal mengoreksi tanpa menghapus history. |
| M08-F04 | Production reference menunjukkan source plant/period/value; period mismatch ditandai; link tidak menyalin nilai tanpa lineage. |
| M08-F05 | Formula/version/included equipment terlihat; zero denominator menghasilkan N/A; Crusher calculation disabled sampai decision; exclusions tidak hard-coded tanpa version. |
| M08-F06 | Weekly report memuat receipt/usage/balance/production/ratio or N/A; total merekonsiliasi ledger; M1–M4 mengikuti configured definition. |

## M09 — Billing, Payment, AR

| Feature ID | Acceptance Criteria |
| --- | --- |
| M09-F01 | Admin dapat membuat invoice draft dengan unique identifier, customer, date, description/lines, DPP dan refs; placeholder proforma bukan primary identity; mandatory refs configurable. |
| M09-F02 | Tax calculation menyimpan rule version/input/output; tanpa decision, invoice dapat draft tetapi tidak dihitung/issued sebagai final; rounding adjustment eksplisit dan diaudit. |
| M09-F03 | Tax invoice number dan supporting docs dapat ditautkan/preview/download; checklist tidak mengklaim complete sebelum mandatory matrix configured. |
| M09-F04 | Status transition tervalidasi dan memiliki history; blank/legacy status dapat dimigrasi sebagai unresolved; `Sudah Bayar` hanya ditetapkan menurut approved allocation rule. |
| M09-F05 | Receipt mencatat date/amount/account/reference; amount tervalidasi; receipt tidak otomatis menyelesaikan invoice; duplicate external reference diperingatkan. |
| M09-F06 | Satu receipt dapat dialokasikan ke banyak invoice dan sebaliknya hanya jika rule memungkinkan; totals/remaining terlihat; posted allocation dapat direverse dan diaudit. |
| M09-F07 | Sistem menghitung allocated/unallocated/remaining/difference; mismatch menjadi exception; ±2.500 dan salah referensi tidak dihapus otomatis. |
| M09-F08 | AR register menunjukkan invoice total, allocation, remaining, billing status dan drill-down; aging tidak tampil tanpa due-date rule; export sesuai permission. |

## M10 — Documents & Letters (P1)

| Feature ID | Acceptance Criteria |
| --- | --- |
| M10-F01 | Authorized user dapat upload/link/preview/download document; metadata type/source/version tersimpan; forbidden user ditolak; required status configurable. |
| M10-F03 | Duplicate number dan inconsistent year terdeteksi; reservation/sequence concurrency aman; pattern dapat dinonaktifkan sampai disetujui; manual override diaudit. |
| M10-F05 | File dapat dipreview/download sesuai permission; archive mempertahankan metadata/history; physical delete/retention mengikuti policy yang disetujui. |

## M11 — Equipment & Vehicle (P1)

| Feature ID | Acceptance Criteria |
| --- | --- |
| M11-F01 | Equipment dapat dibuat/dicari dengan name/brand/type/operator text/reference; duplicate dapat ditandai; histori usage tetap tersedia saat inactive. |
| M11-F02 | Vehicle dapat dibuat dengan police number/brand/type/driver; nomor polisi dinormalisasi; dapat dipilih pada delivery/fuel sesuai active state. |
| M11-F04 | Fuel usage menaut ke equipment ID dan dapat ditelusuri dari kedua modul; legacy text mapping unresolved terlihat; no silent merge. |

## M14 — Approval (P0/P1)

| Feature ID | Acceptance Criteria |
| --- | --- |
| M14-F01 | Request memiliki source, requester, time, before/after, reason, status dan decision history; unauthorized decision ditolak; source state sinkron dan diaudit. |
| M14-F02 | Deviasi harga memicu request; approver/threshold belum diset berarti approval tidak dapat diselesaikan otomatis; approved value terkait snapshot transaksi. |
| M14-F03 | Adjustment request dapat ditampilkan pada generic engine; posting action disabled sampai requester/approver/trigger disetujui. |
| M14-F04 | Excess PO tampil bersama ordered/delivered/proposed/excess; decision policy disabled sampai disetujui; no auto-reject/approve. |
| M14-F05 | CSR request dapat ditautkan ke approval; stock posting menunggu decision hanya jika policy diaktifkan; missing policy tidak dianggap approval. |

## M15 — Dashboard/Reports (P1)

| Feature ID | Acceptance Criteria |
| --- | --- |
| M15-F03 | Approver hanya melihat request dalam scope; pending count sama dengan worklist; drill-down dan decision history tersedia; blocked types diberi label. |
| M15-F04 | Seluruh 21 sheet memiliki report mapping; filter dan totals dapat direkonsiliasi; user hanya melihat report berizin; formula conflict menunjukkan warning/N/A. |

## M16 — Migration & Data Quality

| Feature ID | Acceptance Criteria |
| --- | --- |
| M16-F01 | Import mempertahankan workbook/sheet/row/cell/batch lineage; staging tidak membuat transaksi posted; malformed value masuk exception, bukan hilang. |
| M16-F02 | Alias/customer/date/value dapat dimapping dengan actor/reason; unresolved tetap terpisah; original value selalu dipertahankan. |
| M16-F03 | Duplicate, nonunique proforma, date text/year typo, formula conflict dan value mismatch memiliki severity/status/owner/resolution; critical unresolved dapat memblok migration. |
| M16-F04 | Reconciliation membandingkan counts, qty dan amount per domain; variance dijelaskan; accepted correction terpisah dari source total; report dapat ditandatangani. |
| M16-F05 | Cut-off mencatat source version/time/scope; only approved batch dapat dipromosikan; unresolved critical blocker mencegah sign-off; approver final TBD tidak boleh digantikan developer. |

## Engineering Readiness Gates

- Test otomatis mencakup authorization, calculation, posting idempotency, reversal, migration lineage, file access dan report reconciliation.
- Backup restore diuji, bukan hanya backup job dibuat.
- API validation/error behavior konsisten dan tidak membocorkan sensitive data.
- Frontend responsive, keyboard-usable untuk form utama, dan menampilkan loading/empty/error/permission states.
- UAT memakai happy path dan anomaly cases dari audit: PO negatif, combined transfer, missing BMI inputs, duplicate letter number, mismatched AMP total, and zero BBM denominator.

# 28. CRITICAL BLOCKERS / NEED-CONFIRMATION

| ID | Decision Required | Affected Design | Work That Can Proceed | Must Not Be Finalized | Priority |
| --- | --- | --- | --- | --- | --- |
| BLK-001 | Matriks final customer type × PPN × rekening; tax rate/effective date/rounding | Customer, sales, invoice, account, reports | Master shell, invoice draft, versioned calculator interface | Tax calculation, issue invoice, tax report | P0 |
| BLK-002 | Arti “tidak ada transaksi langsung”: transaction engine atau recording/control | Sales, delivery, stock source-of-truth | Draft/reference/audit/report UI | Posting boundary and official status | P0 |
| BLK-003 | Event resmi perubahan stok dan waktu posting | Production, delivery, sales, CSR, reversal | Ledger and posting adapters | Automatic stock posting | P0 |
| BLK-004 | Approver, threshold, level, delegation dan self-approval harga | Sales/approval/security | Generic engine and request capture | Approved state/routing | P0 |
| BLK-005 | Final material/product list, unit, aliases; `Bass A`, Pasir Beton, Boulder/Batu, cement aliases | All transactions and migration | Canonical/alias workbench | Auto-mapping unresolved terms | P0 |
| BLK-006 | Formula/yield/posting SC/BP/AMP; reconcile SC continuity, BP subtotal, AMP 64.8 vs 48 | Production, inventory, dashboard | Raw actual input and exception view | Calculated/posted production rules | P0 |
| BLK-007 | BBM numerator/denominator, AMP ratio, zero behavior, included/excluded equipment | BBM KPI/report/dashboard | Usage/balance and versioned formula framework | Official efficiency KPI/alert | P0 |
| BLK-008 | Over-delivery policy: reject, warn, allow, or approve | PO, delivery, invoice, approval | Detection and exception capture | Completion behavior and approval | P0 |
| BLK-009 | PO/MOU/DO mandatory order; invoice allowed without each document; delivery completion event | Commercial-to-billing workflow | Flexible references/document model | Mandatory gates/status transition | P0 |
| BLK-010 | Payment rule: combined/partial/overpayment, difference/bank charge/write-off, paid definition | Payment, AR, invoice status | Receipt/allocation draft and reconciliation | Posted allocation/status paid | P0 |
| BLK-011 | CSR approver, mandatory document, valuation and posting status | CSR, stock, reports | CSR draft and source type | Approval/posting/valuation | P1 |
| BLK-012 | Purchase scope: supplier master, supplier PO, receipt, AP or receipt-only | Supplier, inventory, documents | Material receipt shell | Purchase/AP workflow | P1 |
| BLK-013 | Supervisor as application role; full permission matrix for five confirmed roles | Navigation, API auth, dashboards, approval | Default-deny role framework | Production permission/approval | P0 |
| BLK-014 | Period cut-off, M1–M4 definition, historical/current data, closing/backdate/reopen | All transaction/report/migration | Period entity, filters, feature flag | Close/reopen and official monthly KPIs | P0 |
| BLK-015 | Audit events, view access, export, retention and legal deletion | All modules | Broad event capture | Retention/purge/archive policy | P1 |
| BLK-016 | Mandatory document matrix; hard/soft-copy meaning; numbering patterns | Document, billing, admin | Upload/link/archive and duplicate warning | Completeness gate/auto-number | P1 |
| BLK-017 | WCU permission, retention, export, MAP/BMI rules and medical responsibility | HSE/security | Restricted form and nullable validation | Wider access/automatic medical interpretation | P1 |
| BLK-018 | Equipment capacity/ritase/kubikasi and whether maintenance/HM/KM in scope | Delivery/equipment/future maintenance | Current evidence fields and assignment | Automatic volume conversion/maintenance scope | P2 |
| BLK-019 | NFR: hosting, availability, RPO/RTO, backup retention, file limits, security policy | Architecture/operations | Environment design with conservative defaults | Production readiness sign-off | P0 |
| BLK-020 | Migration cut-off, correction policy, owners and final sign-off | All data/reports | Staging/exception/reconciliation | Production import | P0 |

Required decision artifact for every blocker:

```text
Decision ID / Date / Owner / Approved rule / Effective period /
Affected features / Data migration treatment / Acceptance examples /
Rejected alternatives / Sign-off
```

# 29. FINAL SYSTEM MAP

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ M01 PLATFORM: AUTH • USER • ROLE • PERMISSION • AUDIT • PERIOD • CONFIG     │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    ↓
                         ┌────────────────────┐
                         │ M02 MASTER DATA    │
                         │ material/customer │
                         │ price/UOM/plant    │
                         │ document/account  │
                         └─────────┬──────────┘
                                   ↓
             ┌─────────────────────┴───────────────────────┐
             ↓                                             ↓
   ┌──────────────────┐                         ┌──────────────────────┐
   │ M03 SALES / QUO  │                         │ M06 PRODUCTION       │
   │ price validation │                         │ SC • BP • AMP        │
   └────────┬─────────┘                         └──────────┬───────────┘
            ↓                                              │
   ┌──────────────────┐                                    ↓
   │ M04 PO / MOU     │                       ┌────────────────────────┐
   │ ordered/realized │                       │ M07 INVENTORY          │
   └────────┬─────────┘                       │ ledger • balance • CSR │
            ↓                                 └───────────┬────────────┘
   ┌──────────────────┐                                   ↑
   │ M05 DELIVERY     │───────────────────────────────────┘
   │ DO / Surat Jalan │
   └────────┬─────────┘
            ↓
   ┌──────────────────┐       ┌──────────────────────┐
   │ M09 INVOICE      │←──────│ M10 DOCUMENT/LETTER  │
   └────────┬─────────┘       └──────────────────────┘
            ↓
   ┌──────────────────┐
   │ PAYMENT RECEIPT  │
   │ + ALLOCATION     │
   └────────┬─────────┘
            ↓
   ┌──────────────────┐
   │ RECEIVABLE       │
   └────────┬─────────┘
            ↓
   ┌──────────────────┐
   │ M15 REPORTING &  │
   │ DASHBOARD        │
   └──────────────────┘

   M11 EQUIPMENT ──→ M08 BBM ──→ M06 PRODUCTION / M15 REPORT
          │
          └──────────→ M05 DELIVERY / M12 INSPECTION

   M13 EMPLOYEE ─────→ M12 WCU / M11 OPERATOR-DRIVER

   M14 APPROVAL ─────→ SALES PRICE / PO EXCEPTION / STOCK / CSR / CLOSING
   M16 MIGRATION ────→ MASTER + ALL TRANSACTIONS (via staging/reconciliation)
```

Integration rule: semua panah transaksi harus menggunakan structured reference dan audit lineage. Garis tersebut menggambarkan target system behavior, bukan bukti bahwa integrasi yang sama sudah ada di XLSX.

# 30. MASTER DEVELOPMENT CHECKLIST

## A. Foundation

- [ ] Scope/MVP and decision governance approved
- [ ] Authentication
- [ ] User management
- [ ] Role
- [ ] Permission matrix
- [ ] Audit Log
- [ ] Period/cut-off configuration
- [ ] Feature flags for blocked rules
- [ ] System configuration/versioning
- [ ] Secure file storage
- [ ] Environment and CI/CD
- [ ] Logging/monitoring/alerting
- [ ] Backup and restore test
- [ ] Security and privacy baseline
- [ ] API contract and error standard
- [ ] Frontend design system and responsive layout

## B. Master Data

- [ ] Material/Product
- [ ] Material Alias/Normalization
- [ ] Unit of Measure
- [ ] Plant/Unit SC, BP, AMP
- [ ] Customer
- [ ] Supplier `[scope confirmation]`
- [ ] Standard Price
- [ ] Payment Account `[rule confirmation]`
- [ ] Document Type
- [ ] Numbering configuration
- [ ] Equipment
- [ ] Vehicle
- [ ] Employee

## C. Commercial and PO

- [ ] Quotation
- [ ] Quotation lines
- [ ] Price validation
- [ ] Price deviation request
- [ ] Price approval actor/threshold decision
- [ ] Sales register/boundary decision
- [ ] Customer PO
- [ ] PO/MOU rule decision
- [ ] PO product details
- [ ] Delivered and remaining quantity
- [ ] Over-delivery detection
- [ ] Over-delivery policy/approval decision
- [ ] PO history/report

## D. Production

- [ ] Production SC daily input
- [ ] SC 9-material mapping
- [ ] SC internal consumption by destination
- [ ] SC formula/posting decision
- [ ] Production BP daily input
- [ ] BP grade/material mapping
- [ ] BP mix/posting decision
- [ ] Production AMP daily input
- [ ] AMP input/output mapping
- [ ] Resolve AMP 64.8 vs 48 ton
- [ ] Production reconciliation
- [ ] Weekly/monthly production report

## E. Inventory and CSR

- [ ] Opening Stock
- [ ] Stock Movement Ledger
- [ ] Stock Balance
- [ ] Stock Card
- [ ] Material Receipt
- [ ] Production stock posting
- [ ] Delivery/Sales stock posting
- [ ] Official stock-event decision
- [ ] CSR request
- [ ] CSR approval decision
- [ ] CSR stock mutation
- [ ] Stock Opname
- [ ] Stock Adjustment
- [ ] Reversal and backdate policy

## F. Delivery

- [ ] Delivery planning
- [ ] DO
- [ ] Surat Jalan
- [ ] Vehicle/driver assignment
- [ ] Actual delivery/completion
- [ ] PO realization link
- [ ] Stock posting link
- [ ] Invoice source link
- [ ] Delivery history/report

## G. Invoice, Payment, and Receivable

- [ ] Invoice draft
- [ ] Invoice lines/description
- [ ] PO/DO references
- [ ] DPP
- [ ] PPN rule decision
- [ ] Total/rounding rule
- [ ] Tax Invoice
- [ ] Invoice status lifecycle
- [ ] Supporting-document checklist
- [ ] Payment Receipt
- [ ] Payment Account decision
- [ ] Payment Allocation
- [ ] Combined-payment scenario
- [ ] Partial/overpayment rule decision
- [ ] Reconciliation/Difference
- [ ] Paid-status decision
- [ ] Receivable register
- [ ] Aging `[requires due-date rule]`

## H. BBM

- [ ] BBM Receipt
- [ ] Equipment Fuel Usage
- [ ] Total Crusher
- [ ] Total BP
- [ ] Fuel Balance
- [ ] Production Link
- [ ] Crusher ratio decision
- [ ] BP ratio validation
- [ ] AMP ratio decision
- [ ] Equipment inclusion/exclusion decision
- [ ] Zero-denominator handling
- [ ] Weekly BBM report
- [ ] Fuel exception/warning

## I. Documents and Administration

- [ ] Document Bundle
- [ ] Upload
- [ ] Preview
- [ ] Download
- [ ] Hard/soft-copy meaning decision
- [ ] Mandatory document matrix
- [ ] Create Letter
- [ ] Letter Register
- [ ] Search and Filter
- [ ] Letter attachment
- [ ] Numbering
- [ ] Duplicate/year validation
- [ ] Archive
- [ ] Letter/Document Report

## J. Equipment, HSE, and Employee

- [ ] Equipment core data
- [ ] Vehicle core data
- [ ] Operator/Driver assignment
- [ ] Fuel usage relation
- [ ] Delivery relation
- [ ] Extended asset scope decision
- [ ] WCU Examination
- [ ] Blood pressure/MAP fields
- [ ] Blood sugar/Uric acid/Cholesterol
- [ ] Height/Weight/BMI validation
- [ ] WCU Status/Suggestion
- [ ] WCU privacy/retention decision
- [ ] Inspection Object
- [ ] Inspection Program
- [ ] Inspection Actual
- [ ] Target/Actual/Cumulative report
- [ ] Inspection extension scope decision
- [ ] Employee Registry
- [ ] Employee–User separation/link

## K. Approval

- [ ] Generic Approval Worklist
- [ ] Decision history and audit
- [ ] Price Override Approval
- [ ] Stock Adjustment Approval `[confirmation]`
- [ ] PO Deviation/Over-delivery Approval `[confirmation]`
- [ ] CSR Approval `[confirmation]`
- [ ] Invoice Approval `[confirmation]`
- [ ] Closing/Reopen Approval `[confirmation]`

## L. Dashboard and Reporting

- [ ] Management Dashboard
- [ ] Operational Dashboard
- [ ] Approval Dashboard
- [ ] Sales Report
- [ ] Production SC Report
- [ ] Production BP Report
- [ ] Production AMP Report
- [ ] Stock Report
- [ ] PO Report
- [ ] Delivery Report
- [ ] Invoice Report
- [ ] Payment Report
- [ ] AR Report
- [ ] BBM Report
- [ ] Fuel Efficiency Report
- [ ] Equipment Report
- [ ] Letter Report
- [ ] WCU Report
- [ ] Inspection Report
- [ ] Employee Report
- [ ] 21/21 XLSX report mapping verified
- [ ] Role-based report access
- [ ] Export and snapshot audit
- [ ] KPI definition sign-off

## M. Migration and Data Quality

- [ ] Import Staging
- [ ] Workbook/sheet/row/cell lineage
- [ ] Material alias cleansing
- [ ] Customer normalization
- [ ] Date normalization
- [ ] Duplicate document/invoice resolution
- [ ] Formula-conflict register
- [ ] KSO/AMP/BP/SC anomaly resolution
- [ ] Combined-payment reconciliation
- [ ] Cut-off decision
- [ ] Trial migration
- [ ] Counts/quantity/value reconciliation
- [ ] Critical exception closure
- [ ] Migration sign-off

## N. Validation and Go-Live

- [ ] Unit/service tests
- [ ] API contract/integration tests
- [ ] Frontend component and end-to-end tests
- [ ] Permission/negative-access tests
- [ ] Posting idempotency and reversal tests
- [ ] Calculation/version tests
- [ ] File security tests
- [ ] Performance/concurrency tests for approved user target
- [ ] Vulnerability/security review
- [ ] UAT by role and module
- [ ] UAT anomaly scenarios from audit
- [ ] SOP and user training
- [ ] Production deployment plan
- [ ] Rollback plan
- [ ] Backup restore evidence
- [ ] Cut-over approval
- [ ] Hypercare/support ownership
- [ ] Post-go-live reconciliation

# IMPLEMENTATION VERDICT

Blueprint ini cukup untuk memulai **Phase 0, foundation, master-data shell, migration staging, UI discovery, dan development komponen yang berstatus Ready/Partial**. Sistem belum boleh memfinalkan atau mengaktifkan calculation/posting pada area PPN/rekening, stock events, production formula, BBM ratio, over-delivery, payment status/allocation treatment, approval actor, closing, serta migration cut-off sebelum blocker terkait memiliki decision record.

Urutan aman menuju sistem siap digunakan adalah:

```text
Decisions + Foundation
→ Canonical Master + Staging
→ Commercial/PO
→ Production + Inventory Core
→ Delivery + Approved Stock Posting
→ Invoice + Payment Allocation
→ BBM/Assets
→ Administration/HSE/SDM
→ Reconciled Reports/Dashboards
→ Migration + UAT + Cut-over + Hypercare
```
