# FEATURE & WEBSITE OVERVIEW

## Website Project Control PT. Ameera Jaya Abadi

**Sumber utama:** `Blueprint Development Website Project Control PT. Ameera Jaya Abadi.md`  
**Tujuan dokumen:** gambaran awal halaman, menu, fitur, pengguna, alur, prioritas, dan status sebelum UI/UX Design serta coding.  
**Tanggal:** 28 September 2026  
**Status:** Draft untuk Pembahasan Stakeholder

> Catatan keputusan final 29 September 2026: hanya lima role (`SUPERADMIN`, `DIREKTUR`, `ADMIN`, `MANAGER`, `HSE`). Fungsi Admin Project Control dan Finance berada dalam role `ADMIN`. Alur closing/reopen, surat/lampiran, dan depresiasi mengikuti [matriks izin](../System-Requirements/02-Actor-Role-and-Permission-Matrix.xlsx) serta [katalog aturan bisnis](../System-Requirements/04-Business-Rule-Catalog.xlsx); penanda TBD lama di draf ini bukan keputusan yang berlaku untuk area tersebut.

### Arti Status

| Status | Arti Sederhana |
| --- | --- |
| `[CONFIRMED]` | Sudah dinyatakan sebagai kebutuhan/keputusan yang berlaku. |
| `[EVIDENCE]` | Terlihat dari data lama, tetapi belum otomatis menjadi aturan sistem final. |
| `[BASELINE]` | Rencana awal yang masih dapat berubah. |
| `[NEED-CONFIRMATION]` | Belum diputuskan; bagian terkait tidak boleh dianggap final. |

> Dokumen ini menjelaskan apa yang akan dilihat pengguna. Bentuk visual, posisi tombol, warna, dan layout final ditentukan pada tahap UI/UX Design.

# 1. WEBSITE STRUCTURE

```text
Project Control PT. Ameera Jaya Abadi
│
├── Dashboard
│
├── Operasional
│   ├── Penjualan & Quotation
│   ├── Customer PO
│   ├── Delivery / DO / Surat Jalan
│   ├── Produksi
│   │   ├── Stone Crusher (SC)
│   │   ├── Batching Plant (BP)
│   │   ├── Asphalt Mixing Plant (AMP)
│   │   ├── Rekonsiliasi Produksi
│   │   └── Laporan Produksi
│   ├── Inventory & CSR
│   └── BBM
│
├── Keuangan
│   ├── Invoice
│   ├── Payment & Alokasi
│   ├── Piutang
│   └── Rekonsiliasi
│
├── Master Data
│   ├── Material & Product
│   ├── Customer & Supplier
│   ├── Harga
│   ├── UOM & Plant
│   ├── Equipment & Vehicle
│   └── Employee
│
├── Dokumen
│   ├── Document Bundle
│   ├── Surat
│   ├── Register & Pencarian
│   └── Arsip
│
├── HSE & SDM
│   ├── WCU
│   ├── Inspeksi
│   └── Data Pekerja
│
├── Approval & Exception
│
├── Monitoring & Laporan
│   ├── Management Dashboard
│   ├── Operational Dashboard
│   ├── Approval Dashboard
│   ├── Katalog Laporan
│   └── Export / Snapshot
│
└── Pengaturan
    ├── User
    ├── Role & Permission
    ├── System Configuration
    ├── Period & Closing
    ├── Audit Log
    └── Migration & Data Quality
```

### Alasan Pengelompokan

- Pengguna operasional melihat alur kerja dalam satu kelompok, bukan berpindah di antara nama modul teknis.
- Invoice, payment, receivable, dan reconciliation digabung sebagai area Keuangan karena saling berhubungan.
- Equipment, vehicle, dan employee tersedia sebagai master, tetapi juga dapat dipilih dari halaman delivery, BBM, HSE, dan production.
- Dokumen menjadi area bersama karena dipakai oleh quotation, PO, DO/SJ, invoice, payment, dan surat.
- HSE dan SDM digabung pada navigasi karena menggunakan referensi pekerja; akses WCU tetap dibatasi.
- Approval ditempatkan sebagai kotak pekerjaan khusus agar permintaan yang menunggu keputusan mudah ditemukan.
- Migration, audit, dan configuration ditempatkan di Pengaturan karena bukan pekerjaan harian sebagian besar user.

# 2. TABEL GAMBARAN WEBSITE

| No | Menu Utama | Isi/Fitur Utama | Fungsi Sederhana | Pengguna | Prioritas | Status |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Dashboard | Ringkasan aktivitas, PO, delivery, production, stock, billing, approval, exception | Memberi gambaran cepat setelah login | Direktur, Manager, Admin, HSE sesuai akses | P2; Approval view P1 | `[BASELINE]`; KPI tertentu `[NEED-CONFIRMATION]` |
| 2 | Operasional | Sales/Quotation, PO, Delivery/DO, Production, Inventory/CSR, BBM | Menjalankan dan memantau kegiatan utama | Admin; Manager/Direktur melihat; Supervisor jika dikonfirmasi | P0/P1 | Campuran `[CONFIRMED]`, `[EVIDENCE]`, dan blocker |
| 3 | Keuangan | Invoice, payment, allocation, receivable, reconciliation | Mengendalikan tagihan dan penerimaan | Admin; Manager/Direktur sesuai akses; owner final TBD | P0/P1 | Struktur `[EVIDENCE]`; tax/payment rule `[NEED-CONFIRMATION]` |
| 4 | Master Data | Material, customer, supplier, harga, UOM/plant, equipment/vehicle, employee | Menyediakan pilihan data yang sama untuk transaksi | Admin/Superadmin; approval owner TBD | P0/P1/P2 | Core `Partial`; beberapa data belum final |
| 5 | Dokumen | Bundle, surat, numbering, register, search, preview/download, archive | Menyimpan dan mencari bukti yang terkait proses | Admin dan pengguna berizin | P1/P2 | `[BASELINE/EVIDENCE]`; mandatory list TBD |
| 6 | HSE & SDM | WCU, inspection, employee register/report | Monitoring HSE dan data pekerja | HSE; Admin/Management sesuai akses | P2/P3 | Core `[EVIDENCE]`; privacy/detail belum final |
| 7 | Approval & Exception | Worklist, price deviation, stock, over-delivery, CSR, closing | Menampilkan pekerjaan yang membutuhkan keputusan | Requester dan approver yang disetujui | P0/P1/P2 | Harga perlu approval; routing lain banyak yang TBD |
| 8 | Monitoring & Laporan | Dashboard berdasarkan peran, katalog laporan, export/snapshot | Memberi informasi management dan operasional | Direktur, Manager, Admin, HSE sesuai akses | P1/P2 | Reports `[EVIDENCE]`; dashboard `[BASELINE]` |
| 9 | Pengaturan | User, access, configuration, period, audit, migration | Mengelola sistem dan data awal | Superadmin dan pihak berwenang | P0/P1 | Core `Partial`; permission/closing/sign-off TBD |

# 3. GAMBARAN SETIAP HALAMAN UTAMA

## 3.1 Dashboard

**Tujuan:** memberikan ringkasan yang relevan bagi pengguna setelah login.

**Tampilan utama:**

- kartu/ringkasan aktivitas sesuai role;
- daftar pekerjaan yang menunggu perhatian;
- status PO, delivery, production, stock, invoice, payment, dan receivable;
- tautan menuju detail dan laporan.

**Fitur utama:**

1. ringkasan management atau operasional;
2. pekerjaan approval;
3. exception/peringatan data;
4. laporan penting;
5. pintasan ke aktivitas yang sering digunakan.

**Contoh informasi yang ditampilkan:** status PO, delivery terakhir, production per plant, stock balance, invoice status, payment/reconciliation, dan inspection completion. Tidak menampilkan angka resmi jika definisinya belum disetujui.

**Hasil dari halaman:** pengguna mengetahui kondisi umum dan pekerjaan berikutnya.

## 3.2 Operasional

**Tujuan:** menjadi pusat pekerjaan harian dari sales sampai stock dan BBM.

**Tampilan utama:**

- submenu proses bisnis;
- daftar data dengan filter periode/status/customer/plant sesuai halaman;
- status dan exception yang mudah dibedakan;
- tombol buat, lihat detail, ubah draft, validasi, atau action sesuai hak akses.

**Fitur utama:**

1. Penjualan & Quotation;
2. Customer PO;
3. Delivery/DO/SJ;
4. Production SC/BP/AMP;
5. Inventory & CSR;
6. BBM.

**Contoh informasi yang ditampilkan:** customer, material, ordered/delivered/remaining, DO number, production output, stock movement, fuel usage, dan exception.

**Hasil dari halaman:** catatan operasional yang terhubung dan dapat ditelusuri.

## 3.3 Keuangan

**Tujuan:** mengelola invoice, penerimaan, alokasi, selisih, dan piutang.

**Tampilan utama:**

- daftar invoice dan status;
- daftar payment receipt;
- halaman allocation/reconciliation;
- daftar outstanding/receivable;
- supporting documents.

**Fitur utama:**

1. invoice draft dan detail;
2. pajak/total setelah rule disahkan;
3. payment receipt;
4. payment allocation;
5. reconciliation/difference;
6. receivable monitoring.

**Contoh informasi yang ditampilkan:** customer, invoice number/date, DPP, PPN, total, receipt, allocated amount, remaining, status, dan exception.

**Hasil dari halaman:** riwayat tagihan dan penerimaan yang dapat direkonsiliasi. Tax/account serta payment rules tetap `[NEED-CONFIRMATION]`.

## 3.4 Master Data

**Tujuan:** menyediakan data pilihan yang konsisten untuk transaksi.

**Tampilan utama:**

- kelompok master;
- daftar aktif/tidak aktif;
- pencarian, filter, detail, dan alias;
- catatan data yang belum diselesaikan.

**Fitur utama:**

1. Material & Product;
2. Customer & Supplier;
3. Standard Price;
4. UOM & Plant;
5. Equipment & Vehicle;
6. Employee.

**Contoh informasi yang ditampilkan:** nama utama, alias, kategori, unit, plant, customer, harga berlaku, nomor polisi, operator/driver, dan data pekerja.

**Hasil dari halaman:** referensi bersama bagi seluruh menu. Supplier dan sebagian mapping material masih belum final.

## 3.5 Dokumen

**Tujuan:** menyimpan, menautkan, mencari, dan mengarsipkan dokumen bisnis.

**Tampilan utama:**

- register dokumen/surat;
- filter jenis, nomor, tanggal, pihak, dan proses terkait;
- status kelengkapan jika sudah disepakati;
- preview, download, dan history.

**Fitur utama:**

1. document bundle;
2. create/register letter;
3. numbering validation;
4. search/filter;
5. preview/download;
6. archive/report.

**Contoh informasi yang ditampilkan:** quotation/SPH, PO/MOU, DO/SJ, invoice, faktur, kuitansi/tagihan, payment proof, dan surat PO/SPH/SO/SP/SK/SD.

**Hasil dari halaman:** dokumen lebih mudah ditemukan dari prosesnya. Mandatory documents dan numbering pattern masih `[NEED-CONFIRMATION]`.

## 3.6 HSE & SDM

**Tujuan:** mencatat WCU, inspection, dan data pekerja dengan pembatasan akses.

**Tampilan utama:**

- submenu WCU, Inspection, dan Employee;
- daftar pemeriksaan/program/actual;
- detail pekerja dan hasil sesuai hak akses;
- laporan terbatas.

**Fitur utama:**

1. WCU examination dan status/saran;
2. BMI validation;
3. inspection program;
4. inspection actual;
5. employee registry;
6. employee report/user link.

**Contoh informasi yang ditampilkan:** tanggal pemeriksaan, tekanan darah, data WCU, BMI bila data lengkap, inspection object, target/actual, nama, jabatan, dan kontak pekerja.

**Hasil dari halaman:** data HSE dan pekerja lebih terstruktur. Akses, retensi, dan inspection detail lanjutan belum final.

## 3.7 Approval & Exception

**Tujuan:** menampilkan transaksi yang membutuhkan review atau keputusan.

**Tampilan utama:**

- tab Menunggu, Disetujui, Ditolak, dan Dibatalkan sebagai rencana status;
- jenis permintaan, pengaju, waktu, alasan, nilai sebelum/sesudah;
- detail source transaction dan history;
- tombol keputusan hanya untuk approver yang berhak.

**Fitur utama:**

1. approval worklist;
2. price deviation;
3. stock adjustment;
4. PO/over-delivery;
5. CSR/Sumbangan;
6. invoice/closing jika disetujui.

**Contoh informasi yang ditampilkan:** alasan perubahan harga, excess PO, selisih stok, material CSR, dan status decision.

**Hasil dari halaman:** keputusan dan riwayatnya tersimpan. Nama status bersifat `[BASELINE]`; approver/routing sebagian besar `[NEED-CONFIRMATION]`.

## 3.8 Monitoring & Laporan

**Tujuan:** menyediakan ringkasan dan laporan yang dapat ditelusuri ke data sumber.

**Tampilan utama:**

- pilihan dashboard berdasarkan akses;
- katalog laporan per proses;
- filter periode, customer, material, plant, atau status;
- drill-down ke detail;
- export/snapshot untuk pengguna berizin.

**Fitur utama:**

1. Management Dashboard;
2. Operational Dashboard;
3. Approval Dashboard;
4. Report Catalogue;
5. Export/Snapshot.

**Contoh informasi yang ditampilkan:** sales, production, stock, PO, delivery, invoice, payment, receivable, BBM, equipment, HSE, dan employee reports.

**Hasil dari halaman:** kebutuhan laporan XLSX menjadi lebih terstruktur. KPI/cut-off yang belum final ditampilkan sebagai belum tersedia atau exception.

## 3.9 Pengaturan

**Tujuan:** mengelola akun, akses, aturan umum, periode, audit, dan data migrasi.

**Tampilan utama:**

- user dan role/access;
- konfigurasi serta document type/numbering;
- periode/closing;
- audit log;
- migration batch, mapping, exception, dan reconciliation.

**Fitur utama:**

1. user management;
2. role & permission;
3. system configuration;
4. period & closing;
5. audit log;
6. migration & data quality.

**Contoh informasi yang ditampilkan:** akun aktif, role, perubahan penting, periode, data belum termapping, hasil reconciliation, dan sign-off status.

**Hasil dari halaman:** administrasi sistem dan data awal lebih terkontrol. Menu ini bukan fokus pengguna operasional.

# 4. DASHBOARD

Dashboard mengikuti role dan hanya menggunakan data yang telah memenuhi status yang disepakati.

| Komponen | Informasi yang Dilihat | Tujuan |
| --- | --- | --- |
| Ringkasan Aktivitas | Data/aktivitas terbaru yang boleh dilihat user | Mempercepat orientasi setelah login |
| Quotation & Harga | Status quotation dan price deviation | Melihat pekerjaan komersial dan approval |
| Customer PO | Ordered, delivered, remaining, exception | Memantau pemenuhan order |
| Pengiriman | Rencana/actual, DO/SJ, status, exception | Memantau delivery |
| Production | SC/BP/AMP output dan exception | Memantau kegiatan plant |
| Persediaan | Saldo dan movement penting | Melihat kondisi stok; definisi posting harus final |
| BBM | Receipt, usage, balance, ratio/N/A | Memantau fuel; ratio menunggu formula final |
| Invoice | Invoice dan billing status | Memantau penagihan |
| Payment & Receivable | Receipt, allocation, remaining, difference | Memantau penerimaan dan piutang |
| Approval | Jumlah/daftar pekerjaan menunggu keputusan | Mempercepat review |
| Exception | Konflik, missing data, negative remaining, mismatch | Menunjukkan hal yang perlu perhatian |
| HSE | Inspection completion dan ringkasan yang diizinkan | Monitoring HSE tanpa membuka data sensitif |
| Laporan Penting | Tautan ke laporan sesuai role | Mempercepat akses informasi |

Dashboard tidak menetapkan angka target, KPI, warna indikator, atau definisi “baik/buruk” sebelum keputusan tersedia.

# 5. OPERASIONAL

## 5.1 Penjualan & Quotation

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Daftar Quotation | Melihat, mencari, membuat, dan membuka quotation | `[BASELINE]` |
| Detail Item | Memilih customer, material/product, quantity, dan harga | `[BASELINE/CONFIRMED]` data dasar |
| Price Control | Membandingkan harga yang ditawarkan dengan standard price | `[CONFIRMED]` kebutuhan |
| Price Override | Memberi alasan bila harga berbeda | `[CONFIRMED]` kebutuhan |
| Sales Monitoring | Melihat daftar sales/quotation dan statusnya | `[EVIDENCE/BASELINE]` |

Approval harga muncul melalui menu Approval & Exception. Approver, threshold, dan batas transaksi resmi sistem masih `[NEED-CONFIRMATION]`.

## 5.2 Customer PO

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Daftar PO | Mencari PO berdasarkan customer/nomor/periode | `[CONFIRMED/EVIDENCE]` |
| Detail PO | Melihat produk, ordered quantity, unit, dan dokumen | `[EVIDENCE]` |
| Realisasi PO | Melihat pengiriman yang mengurangi sisa PO | `[EVIDENCE]` |
| Remaining PO | Melihat ordered, delivered, dan remaining | `[EVIDENCE]` |
| Exception | Melihat negative remaining atau data tanpa baseline PO | `[EVIDENCE]` |
| Riwayat | Membuka delivery dan invoice reference terkait | `[EVIDENCE/BASELINE]` |

Perilaku saat over-delivery dan penggunaan MOU masih `[NEED-CONFIRMATION]`.

## 5.3 Delivery / DO / Surat Jalan

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Delivery Planning | Membuat dan melihat rencana pengiriman | `[BASELINE]` |
| DO/Surat Jalan | Mencatat nomor, tanggal, customer, item, quantity, dan referensi | `[CONFIRMED]` |
| Vehicle/Driver | Memilih kendaraan dan driver/operator dari master | `[EVIDENCE/BASELINE]` |
| Delivery Completion | Mencatat actual delivery | `[NEED-CONFIRMATION]` event/status |
| Delivery History | Menelusuri PO, DO/SJ, item, jumlah, vehicle, dan invoice reference | `[EVIDENCE/BASELINE]` |

Halaman tidak boleh mengurangi stok atau mengubah PO secara final sebelum completion/posting rule disetujui.

## 5.4 Produksi

Satu menu Produksi memiliki tab/submenu berdasarkan plant.

| Subbagian | Informasi/Fitur yang Terlihat | Status |
| --- | --- | --- |
| Stone Crusher | Tanggal, 9 material/output, production quantity, internal use ke Base A/B/BP/AMP | `[EVIDENCE]`; formula/posting TBD |
| Batching Plant | Bahan, consumption per grade, output K-175/K-225/K-250/K-300/K-350 | `[EVIDENCE]`; mix rule TBD |
| Asphalt Mixing Plant | Bahan/BBM, output AC-WC/AC-BC, mismatch | `[EVIDENCE]`; 64,8 vs 48 ton unresolved |
| Rekonsiliasi Produksi | Membandingkan detail, total, input/output, dan exception | `[BASELINE]` |
| Production Report | Filter plant/material/grade/periode dan membuka detail | `[EVIDENCE/BASELINE]` |

Action utama: buat draft, lihat detail, ubah selama diizinkan, validasi, melihat exception, dan posting setelah rule disetujui. Nama status Draft/Validated/Posted/Reopened adalah `[BASELINE]`.

## 5.5 Inventory & CSR

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Stock Balance | Melihat saldo berdasarkan material/plant/periode | `[EVIDENCE/BASELINE]` |
| Stock Movement/Card | Melihat urutan masuk/keluar dan sumber transaksi | `[CONFIRMED]` konsep; event TBD |
| Material Receipt | Mencatat barang/material masuk | `[EVIDENCE]`; purchase scope TBD |
| Production/Delivery Posting | Melihat status calon/hasil perubahan stok | `[BASELINE/NEED-CONFIRMATION]` |
| CSR/Sumbangan | Mencatat penerima, alasan, material, quantity, dan dokumen | Dampak stok `[CONFIRMED]`; approval TBD |
| Stock Opname/Adjustment | Mencatat hasil fisik, selisih, dan alasan | `[BASELINE]`; approval/closing TBD |

Halaman detail harus menunjukkan sumber movement. Saldo tidak boleh diubah langsung tanpa riwayat.

## 5.6 BBM

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| BBM Receipt | Mencatat tanggal dan liter BBM masuk | `[EVIDENCE]` |
| Fuel Usage | Mencatat penggunaan per alat/kendaraan dan unit | `[EVIDENCE]` |
| Fuel Balance | Melihat saldo awal, masuk, pemakaian, dan sisa | `[EVIDENCE]` |
| Production Relation | Melihat hasil SC/BP yang digunakan untuk monitoring | `[EVIDENCE]` |
| Fuel Ratio & Exception | Melihat hasil, rumus/version, included equipment, atau N/A | `[NEED-CONFIRMATION]` formula |
| Weekly Report | Melihat penggunaan/saldo/production per periode | `[EVIDENCE]`; definisi minggu TBD |

# 6. KEUANGAN

## 6.1 Invoice

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Invoice Draft | Membuat/melihat invoice, customer, description/lines, dan reference | `[CONFIRMED]` konsep |
| Tax & Total | Melihat DPP, PPN, total, dan rule yang digunakan | `[EVIDENCE]`; rule `[NEED-CONFIRMATION]` |
| Supporting Documents | Menghubungkan PO/DO/faktur/dokumen lain sesuai rule | `[CONFIRMED/BASELINE]`; mandatory TBD |
| Invoice Status | Melihat riwayat status invoice/billing/payment | `[EVIDENCE]`; transition TBD |
| Invoice History | Menelusuri dokumen, receipt, allocation, dan exception | `[BASELINE]` |

Invoice dapat dibuat sebagai draft, tetapi tax calculation atau issue final tidak boleh dipaksakan sebelum aturan PPN/rekening disetujui.

## 6.2 Payment & Allocation

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Payment Receipt | Mencatat tanggal, amount, account, dan reference | `[EVIDENCE]`; account rule TBD |
| Payment Allocation | Memilih satu/beberapa invoice dan nilai alokasi | Multi-invoice `[EVIDENCE]`; detail rule TBD |
| Allocation Summary | Melihat total receipt, allocated, dan belum dialokasikan | `[BASELINE]` |
| Reversal/Correction | Membatalkan allocation melalui riwayat, bukan menghapus | `[BASELINE/NEED-CONFIRMATION]` |

## 6.3 Piutang & Rekonsiliasi

| Fitur yang Terlihat | Yang Dilakukan User | Status |
| --- | --- | --- |
| Receivable List | Melihat invoice, total, pembayaran, dan outstanding | `[EVIDENCE/BASELINE]` |
| Reconciliation | Membandingkan invoice dengan allocation dan difference | `[EVIDENCE]` |
| Exception | Melihat payment mismatch, unallocated amount, atau status unresolved | `[EVIDENCE/BASELINE]` |
| Aging | Melihat umur piutang jika due-date rule disetujui | `[BASELINE/NEED-CONFIRMATION]` |

Aturan payment sebagian, overpayment, write-off, bank charge, difference, reversal, dan paid status masih `[NEED-CONFIRMATION]`.

# 7. MASTER DATA

| Kelompok Halaman | Data Utama yang Dikelola | Dipakai Oleh | Status/Catatan |
| --- | --- | --- | --- |
| Material & Product | Nama utama, alias, category, UOM, product/material type, active | Sales, PO, Production, Inventory, Delivery, CSR | Base Course A/B dan Sirtu≠Sirtu Jaw `[CONFIRMED]`; `Bass A` dan beberapa mapping TBD |
| Customer & Supplier | Nama/identitas pihak; supplier bila scope disetujui | Sales, PO, Delivery, Invoice, Material Receipt | Customer `[EVIDENCE]`; Supplier `[BASELINE/NEED-CONFIRMATION]` |
| Harga | Material/product, harga acuan, masa berlaku/history | Quotation, Sales, Approval | Standard price dibutuhkan `[CONFIRMED]` |
| UOM & Plant | m³, ton, liter; SC, BP, AMP | Seluruh proses quantity/plant | `[EVIDENCE]` |
| Equipment & Vehicle | Nama, brand/type, nomor polisi, operator/driver | BBM, Delivery, Inspection | Field dasar `[EVIDENCE]`; capacity/ownership/HM/KM TBD |
| Employee | Nama, jabatan, kelahiran, alamat, tanggal masuk, kontak | HSE, assignment, SDM | `[EVIDENCE]`; data sensitif dibatasi |

Halaman master menggunakan daftar, pencarian, form, detail, active/inactive, dan history. Delete permanen bukan action utama karena histori transaksi harus tetap terbaca.

# 8. DOKUMEN

| Fitur | Gambaran untuk User | Status |
| --- | --- | --- |
| Document Bundle | Melihat seluruh dokumen yang terkait satu transaksi | `[CONFIRMED/BASELINE]` |
| Upload & Relation | Mengunggah file dan memilih quotation/PO/DO/invoice/payment/letter terkait | `[BASELINE]` |
| Letter | Membuat/mencatat type, nomor, tanggal, tujuan, perihal, dan keterangan | `[EVIDENCE]` |
| Numbering | Memeriksa duplicate/tahun dan menghasilkan nomor bila rule disetujui | `[BASELINE/NEED-CONFIRMATION]` |
| Document Register | Melihat daftar dokumen/surat lintas proses | `[EVIDENCE/BASELINE]` |
| Search, Preview & Download | Mencari dan membuka file sesuai hak akses | `[BASELINE]` |
| Archive & Report | Mengarsipkan record dan melihat laporan kelengkapan | `[BASELINE]` |

Menu Dokumen adalah pusat pencarian. Dokumen tetap dapat terlihat dari halaman proses terkait agar user tidak selalu berpindah menu.

# 9. HSE & SDM

## 9.1 HSE

| Fitur | Yang Terlihat/Dilakukan | Status |
| --- | --- | --- |
| WCU Examination | Employee, tanggal, tekanan darah, MAP, gula darah, asam urat, kolesterol, tinggi/berat | `[EVIDENCE]` |
| BMI Validation | BMI tampil hanya bila tinggi/berat valid | `[EVIDENCE]` quality requirement |
| WCU Status/Suggestion | HSE mencatat status dan saran; tidak ada diagnosis otomatis | `[EVIDENCE]`; rule klinis TBD |
| Inspection Program | Object, frequency, date, target | `[EVIDENCE]` |
| Inspection Actual | Actual completion dan jumlah | `[EVIDENCE]` |
| Inspection Detail | Checklist, photo, finding, PIC, risk, follow-up | `[BASELINE/NEED-CONFIRMATION]` |
| Restricted Report | Laporan sesuai hak akses | `[BASELINE]`; access/retention TBD |

## 9.2 SDM

| Fitur | Yang Terlihat/Dilakukan | Status |
| --- | --- | --- |
| Employee Registry | Daftar, form, dan detail pekerja | `[EVIDENCE]` |
| Employee–User Link | Menghubungkan pekerja dengan akun bila diperlukan | `[BASELINE]` |
| Employee Report | Filter dan laporan pekerja | `[EVIDENCE]` |

Jabatan Supervisor tidak otomatis menjadi role aplikasi. Hak akses ditentukan terpisah.

# 10. APPROVAL & EXCEPTION

```text
Menunggu Persetujuan
        ↓
User berwenang membuka detail
        ↓
Review informasi dan sumber transaksi
        ↓
Approve / Reject / Action
        ↓
Keputusan tercatat di sistem
```

| Jenis Pekerjaan | Informasi yang Direview | Status |
| --- | --- | --- |
| Price Deviation | Standard price, proposed price, selisih, alasan | Approval need `[CONFIRMED]`; actor TBD |
| Stock Adjustment | Nilai sebelum/sesudah dan alasan | `[BASELINE/NEED-CONFIRMATION]` |
| PO/Over-delivery | Ordered, delivered, proposed, excess | `[NEED-CONFIRMATION]` |
| CSR/Sumbangan | Recipient, reason, material, quantity | Approval `[NEED-CONFIRMATION]` |
| Invoice | Invoice detail dan documents | Approval `[NEED-CONFIRMATION]` |
| Period Closing/Reopen | Periode, alasan, dampak | `[BASELINE/NEED-CONFIRMATION]` |
| Data Exception | Alias, duplicate, mismatch, atau migration issue | `[EVIDENCE/BASELINE]` |

Jika approver/routing belum ditentukan, sistem tidak boleh menganggap request otomatis disetujui.

# 11. MONITORING & LAPORAN

| Halaman | Isi Utama | Pengguna |
| --- | --- | --- |
| Management Dashboard | Sales, production, stock, PO, delivery, invoice, payment, receivable, BBM, HSE sesuai definisi | Direktur/Manager |
| Operational Dashboard | Production, stock, BBM, PO, delivery, exception | Admin/Manager; Supervisor bila dikonfirmasi |
| Approval Dashboard | Pending, deviation, exception, decision history | Approver sesuai matrix |
| Report Catalogue | Daftar report yang merapikan kebutuhan 21 worksheet | Pengguna sesuai role |
| Report Viewer | Filter, total, drill-down, warning/N/A | Pengguna berizin |
| Export/Snapshot | Menghasilkan salinan report dengan parameter, user, dan waktu | Pengguna berizin |

Report utama mencakup sales, SC/BP/AMP, stock, PO, delivery, invoice/AR, fuel, equipment, letter, WCU, inspection, dan employee. Penjadwalan/pengiriman otomatis report tidak dikonfirmasi.

# 12. PENGATURAN

| Fitur | Fungsi untuk User Berwenang | Status |
| --- | --- | --- |
| User Management | Membuat akun, memberi role, mengaktifkan/nonaktifkan | Role `[CONFIRMED]`; detail `[BASELINE]` |
| Role & Permission | Mengatur menu/data/action yang boleh digunakan | `[NEED-CONFIRMATION]` matrix |
| System Configuration | Mengatur referensi dan opsi umum yang sudah disetujui | `[BASELINE]` |
| Period & Closing | Membuka/menutup periode dan melihat history | `[BASELINE/NEED-CONFIRMATION]` |
| Audit Log | Mencari perubahan, approval, posting, reversal, export, config | `[BASELINE]`; retention TBD |
| Migration & Data Quality | Import staging, mapping, exception, reconciliation, sign-off | Need `[EVIDENCE]`; sign-off TBD |

Pengaturan ditampilkan hanya kepada pengguna berwenang dan tidak menjadi pusat pekerjaan user operasional.

# 13. USER JOURNEY

## 13.1 Alur Utama Komersial

```text
Login
  ↓
Dashboard
  ↓
Master Data
  ↓
Quotation / Sales
  ↓
Pengecekan Harga
  ↓
Approval bila Harga Berbeda
  ↓
Customer PO
  ↓
Delivery / DO / Surat Jalan
  ↓
Realisasi PO dan Stock Movement [EVENT TBD]
  ↓
Invoice
  ↓
Payment Receipt
  ↓
Payment Allocation
  ↓
Piutang / Rekonsiliasi
  ↓
Dashboard & Laporan
```

Quotation bersifat `[BASELINE]`. PPN/rekening, stock event, status paid, serta beberapa approval tetap `[NEED-CONFIRMATION]`.

## 13.2 Alur Produksi

```text
Produksi SC / BP / AMP
        ↓
Rekonsiliasi / Validasi
        ↓
Inventory [POSTING TBD]
        ↓
Delivery / Sales / Report
```

## 13.3 Alur BBM

```text
BBM Receipt
    ↓
Equipment Fuel Usage
    ↓
Fuel Balance
    ↓
Production Link
    ↓
Fuel Monitoring [FORMULA TBD]
```

## 13.4 Alur CSR

```text
CSR Request
    ↓
Approval [TBD]
    ↓
Stock Out [EVENT TBD]
    ↓
CSR Report
```

## 13.5 Fitur Pendukung di Semua Alur

- **Approval** muncul dari transaksi terkait dan juga terkumpul dalam satu worklist.
- **Dokumen** dapat diunggah/dilihat dari transaksi serta dicari melalui menu Dokumen.
- **Audit** mencatat action penting di belakang layar.
- **Exception** membawa user kembali ke detail yang perlu diperbaiki atau diputuskan.

# 14. FITUR UTAMA YANG PALING TERLIHAT USER

## Core Features

1. **Dashboard** — ringkasan dan pekerjaan yang memerlukan perhatian.
2. **Quotation & Price Control** — penawaran dan kontrol perubahan harga.
3. **Customer PO** — ordered, delivered, remaining, dan exception.
4. **Delivery / DO / Surat Jalan** — pencatatan dan bukti pengiriman.
5. **Production** — SC/BP/AMP dalam satu menu dengan tab terpisah.
6. **Inventory & CSR** — stock balance, movement, CSR, dan adjustment.
7. **Invoice** — tagihan dan supporting documents.
8. **Payment & Receivable** — receipt, allocation, reconciliation, dan piutang.
9. **Approval & Exception** — daftar pekerjaan yang membutuhkan keputusan.
10. **Monitoring & Reports** — dashboard, report, drill-down, dan export.

## Supporting Features

- Master Data;
- BBM dan Equipment/Vehicle;
- Document/Letter Administration;
- HSE/WCU/Inspection dan Employee;
- User/Role/Configuration/Period/Audit;
- Migration & Data Quality.

Supporting tidak berarti tidak penting. Fitur tersebut ditempatkan sesuai konteks agar menu utama tetap mudah dipahami.

# 15. FEATURE MAP

```text
                                  DASHBOARD
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
   OPERASIONAL                    KEUANGAN                   MONITORING
        │                             │                             │
  ┌─────┼─────────┬────────┐     ┌────┼────────┐              ┌─────┼─────┐
  │     │         │        │     │    │        │              │           │
Sales  PO     Delivery  Production Invoice Payment/Piutang Dashboard   Reports
  │     │         │        │       │    │
  └─────┴─────┬───┘        ↓       └────┴──────→ Rekonsiliasi
              │         Inventory
              │             ↑
              └─────────────┘
                            ↑
                      CSR / Stock Out

BBM ──→ Equipment ──→ Production

MASTER DATA ──→ seluruh proses
DOCUMENT ─────→ Sales / PO / Delivery / Invoice / Payment
APPROVAL ─────→ Price / PO Exception / Stock / CSR / Closing
HSE & SDM ────→ WCU / Inspection / Employee Report
PENGATURAN ───→ User / Access / Period / Audit / Migration
```

Panah stock, approval, tax, dan payment tertentu menggambarkan hubungan target. Action final tetap mengikuti keputusan yang telah disahkan.

# 16. FITUR VS MENU

| Modul Blueprint | Ditampilkan Sebagai | Menu/Area Website | Alasan Pengelompokan |
| --- | --- | --- | --- |
| M01 Platform, User & Security | Login di awal; user/access/audit/config sebagai fungsi pengaturan | Pengaturan + fungsi background | Bukan pekerjaan harian sebagian besar user |
| M02 Master Data | Kelompok master yang mudah dipilih | Master Data | Menjadi referensi semua transaksi |
| M03 Sales & Quotation | Submenu Penjualan & Quotation | Operasional | Bagian awal alur komersial |
| M04 Customer PO & MOU | Submenu Customer PO | Operasional | Berkaitan langsung dengan sales dan delivery |
| M05 Delivery & DO/SJ | Submenu Delivery / DO / Surat Jalan | Operasional | Pekerjaan pengiriman harian |
| M06 Production SC/BP/AMP | Satu menu Produksi dengan tab SC/BP/AMP | Operasional | Satu tujuan bisnis dengan form berbeda per plant |
| M07 Inventory & CSR | Submenu Inventory & CSR | Operasional | Stock movement dan CSR saling terkait |
| M08 BBM | Submenu BBM | Operasional | Digunakan untuk monitoring fuel dan production |
| M09 Invoice, Payment & Receivable | Invoice, Payment & Alokasi, Piutang/Rekonsiliasi | Keuangan | Satu rangkaian billing dan penerimaan |
| M10 Document & Letter Administration | Document Center dan Letter Register | Dokumen | Dipakai lintas transaksi dan administrasi |
| M11 Equipment & Vehicle | Master Equipment/Vehicle; selector pada BBM/Delivery/Inspection | Master Data + fitur dalam proses | Data dibuat sekali, dipakai pada banyak halaman |
| M12 HSE — WCU & Inspection | Submenu WCU dan Inspeksi | HSE & SDM | Membutuhkan konteks dan akses khusus |
| M13 Employee / SDM | Data Pekerja; selector pada WCU/assignment | HSE & SDM + Master Data | Employee adalah referensi, bukan role otomatis |
| M14 Approval & Exception | Worklist terpusat dan action dari detail transaksi | Approval & Exception | User dapat menemukan seluruh pekerjaan keputusan di satu tempat |
| M15 Dashboard & Reports | Dashboard awal dan area katalog laporan | Dashboard + Monitoring & Laporan | Ringkasan perlu terlihat saat login; report memiliki area sendiri |
| M16 Migration & Data Quality | Import, mapping, exception, reconciliation, sign-off | Pengaturan | Digunakan terbatas oleh pihak yang menyiapkan data |

> **16 modul sistem tidak sama dengan 16 menu utama.** Modul menjaga batas tanggung jawab sistem; menu mengelompokkan pekerjaan agar mudah digunakan.

# 17. PRIORITAS FITUR

## P0 — Fondasi/Wajib

- login, user, role/access shell, dan audit;
- material/product, alias, UOM/plant, customer, dan standard price;
- price validation dan approval shell;
- Customer PO dan detail;
- DO/Surat Jalan serta delivery core;
- input/reconciliation production SC/BP/AMP;
- opening stock, movement ledger, balance, dan stock card;
- invoice draft, payment receipt/allocation/reconciliation core;
- migration staging, exception, dan reconciliation.

Beberapa P0 tetap `Blocked` untuk aktivasi: tax, official stock posting, production formula tertentu, status paid, approval routing, dan migration sign-off.

## P1 — Operasional Utama

- quotation dan sales monitoring;
- PO/delivery history dan reports;
- CSR/Sumbangan;
- material receipt serta stock adjustment setelah rule tersedia;
- BBM, equipment/vehicle core, dan fuel report;
- document bundle, archive, dan numbering validation;
- receivable register;
- report catalogue dan approval dashboard;
- period/configuration shell.

## P2 — Pendukung

- letter administration;
- employee registry/report;
- WCU dan inspection program/actual;
- management/operational dashboard;
- export/snapshot;
- approval tambahan jika disetujui.

## P3 — Pengembangan Berikutnya

- ownership/capacity/HM/KM/maintenance alat;
- inspection checklist, photo, finding, PIC, risk, dan follow-up;
- notifikasi atau analisis lanjutan setelah kebutuhannya disahkan.

# 18. FITUR YANG MASIH BELUM FINAL

| Fitur/Area | Yang Belum Diputuskan | Dampak ke Sistem | Status |
| --- | --- | --- | --- |
| PPN & Rekening | Hubungan customer/account/tax, tanggal berlaku, pembulatan | Tax/total invoice dan payment belum dapat difinalkan | `[NEED-CONFIRMATION]` / `Blocked` |
| Batas Transaksi | Sistem mencatat atau menjadi sumber transaksi resmi | Waktu posting dan source of truth tidak jelas | `[NEED-CONFIRMATION]` / `Blocked` |
| Stock Posting | Event production/delivery/sales/CSR/adjustment yang resmi | Saldo dapat ganda atau tidak berubah | `[NEED-CONFIRMATION]` / `Blocked` |
| Material & UOM | Alias/nama final termasuk `Bass A`, Pasir Beton, semen, Boulder/Batu | Master dan migration dapat salah | `[NEED-CONFIRMATION]` |
| Production Formula | Formula/yield/validator SC/BP/AMP dan konflik 64,8 vs 48 ton | Total production dan stock belum final | `[NEED-CONFIRMATION]` / `Blocked` |
| Price Approval | Approver, threshold, level, delegation | Worklist harga tidak dapat diaktifkan penuh | `[NEED-CONFIRMATION]` |
| Role & Permission | Hak tiap role dan status Supervisor | Menu/action/user data belum final | `[NEED-CONFIRMATION]` |
| Approval Matrix | Stock, over-delivery, CSR, invoice, closing | Routing dan keputusan belum final | `[NEED-CONFIRMATION]` |
| Over-delivery | Reject, warn, allow, atau approve | Delivery/PO completion belum final | `[NEED-CONFIRMATION]` / `Blocked` |
| PO/MOU/DO Rules | Dokumen wajib dan urutan sebelum delivery/invoice | Gate transaksi belum final | `[NEED-CONFIRMATION]` |
| Payment Rules | Partial/combined/overpayment, difference, reversal, paid status | Piutang dan status invoice belum final | `[NEED-CONFIRMATION]` / `Blocked` |
| Closing/Period | Cut-off, week M1–M4, backdate, reopen | Report periode dan perubahan data belum final | `[NEED-CONFIRMATION]` |
| BBM Ratio | Numerator, denominator, AMP, equipment inclusion/exclusion | Monitoring efisiensi belum final | `[NEED-CONFIRMATION]` / `Blocked` |
| Documents | Mandatory list, numbering, hard/soft copy, retention | Kelengkapan dan arsip belum final | `[NEED-CONFIRMATION]` |
| WCU/HSE | Hak akses, retention, export, MAP/rule medis | Data sensitif dan calculation belum final | `[NEED-CONFIRMATION]` |
| Migration | Cut-off, owner, correction policy, sign-off | Data belum boleh dipromosikan ke sistem aktif | `[NEED-CONFIRMATION]` / `Blocked` |
| Backup/Recovery | Frekuensi, retention, target pemulihan, owner | Production readiness belum dapat dinilai | `[NEED-CONFIRMATION]` |

# 19. HASIL AKHIR — APA YANG AKAN DILIHAT USER?

Saat website dibuka, user pertama kali melihat halaman **Login**. Setelah berhasil masuk, user diarahkan ke **Dashboard** yang menampilkan ringkasan sesuai role dan hak aksesnya. Direktur dan Manager lebih banyak melihat informasi serta exception. Admin melihat pekerjaan input dan tindak lanjut. HSE melihat WCU/inspection sesuai akses. Supervisor hanya mendapat tampilan khusus bila role tersebut nantinya disetujui.

```text
Login
  ↓
Dashboard
  ↓
Menu Utama
  ↓
Submenu Proses
  ↓
Daftar Data
  ↓
Detail
  ↓
Action sesuai Hak Akses
  ↓
Approval bila Diperlukan
  ↓
Laporan / Monitoring
```

Pada setiap submenu, pola halaman dibuat konsisten:

1. **Daftar:** menampilkan data utama, status, filter, dan pencarian.
2. **Form:** digunakan untuk membuat atau memperbarui data yang masih boleh diubah.
3. **Detail:** menunjukkan informasi lengkap, dokumen, hubungan transaksi, dan riwayat.
4. **Action:** validate, complete, submit approval, approve/reject, cancel/reverse, export, atau action lain sesuai aturan dan akses.
5. **Exception:** menunjukkan data yang salah, belum lengkap, berbeda, atau membutuhkan keputusan.
6. **Laporan:** merangkum data dan memungkinkan user membuka detail sumber.

Alur paling terlihat adalah Operasional dan Keuangan: quotation/sales diteruskan ke Customer PO, delivery, DO/SJ, stock/realization, invoice, payment, receivable, dan reports. Di sisi lain, production SC/BP/AMP memasok informasi ke inventory; BBM terhubung ke equipment dan production; CSR mengubah stock setelah aturan disetujui; documents dan approvals mendukung transaksi terkait.

Menu Master Data dan Pengaturan tidak mendominasi pekerjaan harian, tetapi memastikan user memilih material, customer, harga, equipment, employee, dan dokumen yang konsisten. Migration dan data-quality tools hanya terlihat kepada user yang ditugaskan.

Dengan gambaran ini, stakeholder dapat membayangkan website sebagai rangkaian halaman kerja yang saling terhubung—bukan kumpulan 16 menu terpisah. Tahap UI/UX berikutnya dapat menggunakan struktur ini untuk menyusun sitemap final, wireframe, user flow per role, daftar layar, serta prototype, tanpa memfinalkan rule yang masih `[NEED-CONFIRMATION]`.
