# Keputusan Final Digitalisasi Project Control PT AJA

**Status:** Baseline final pengembangan  
**Tanggal:** 29 September 2026  
**Tujuan:** Mengganti proses Project Control berbasis Excel menjadi website terintegrasi tanpa memindahkan duplikasi dan kesalahan Excel ke sistem baru.

## 1. Keputusan Utama

1. Website menjadi sumber data resmi setelah go-live. Excel lama disimpan sebagai arsip baca-saja.
2. Data dicatat satu kali pada proses asal. Modul lain membaca hasil transaksi yang sama.
3. Sistem dibangun sebagai aplikasi web modular untuk satu perusahaan dan banyak plant: Stone Crusher, Batching Plant, dan Asphalt Mixing Plant.
4. Implementasi dilakukan bertahap. Operasional utama didigitalisasi lebih dahulu, kemudian administrasi, aset, dan HSE.
5. Transaksi yang sudah diposting tidak boleh dihapus atau diubah langsung. Koreksi dilakukan melalui reversal atau penyesuaian dengan alasan dan audit log.
6. Full accounting, payroll, procurement lengkap, dan integrasi pajak bukan bagian proyek ini.

## 2. Menu dan Fitur Final

| Menu | Fitur utama | Tahap |
| --- | --- | --- |
| Dashboard | Ringkasan penjualan, PO, pengiriman, produksi, stok, BBM, invoice, piutang, approval, dan exception sesuai role | Tahap 1 |
| Master Data | Material, produk, UOM, plant, customer, supplier, proyek, harga, rekening, pajak, equipment, kendaraan, dan pekerja | Tahap 1 |
| Penjualan | Quotation/SPH, sales order, Customer PO, harga kontrak, penjualan material/beton/hotmix/sewa | Tahap 1 |
| Pengiriman | Delivery planning, DO/Surat Jalan, kendaraan, driver, ritase, mode diantar atau diambil customer | Tahap 1 |
| Produksi | Produksi SC, BP, AMP, serta blending Base A dan Base B | Tahap 1 |
| Inventory | Goods receipt, inventory ledger, saldo, kartu stok, stock opname, adjustment, CSR/internal use | Tahap 1 |
| BBM | Penerimaan BBM, pemakaian per alat, saldo tangki, mutasi, dan rasio terhadap produksi | Tahap 1 |
| Keuangan Operasional | Invoice, pembayaran, alokasi pembayaran, potongan PPh, piutang, aging, dan rekonsiliasi | Tahap 1 |
| Approval dan Exception | Harga khusus, perubahan PO, adjustment stok, reversal, CSR, dan pembukaan periode | Tahap 1 |
| Laporan | Penjualan, PO, delivery, produksi, stok, BBM, invoice, piutang, serta export XLSX/PDF | Tahap 1 |
| Dokumen dan Surat | ADMIN fungsi Project Control menerbitkan surat, nomor, register, dan lampiran umum; ADMIN fungsi Finance mengelola lampiran keuangan; pencarian, preview, dan arsip | Tahap 2 |
| Equipment dan Aset | ADMIN fungsi Project Control mengelola data fisik; ADMIN fungsi Finance mengelola parameter dan memverifikasi depresiasi garis lurus bulanan otomatis | Tahap 2 |
| HSE dan SDM | Data pekerja, WCU, DCU, program inspeksi, realisasi, temuan, foto, PIC, dan tindak lanjut | Tahap 2 |
| Pengaturan | User, role, permission, periode, audit log, konfigurasi, migration batch, dan data quality | Tahap 1 |

Tahap 1 menghasilkan Core Go-Live. Tahap 2 menyelesaikan penggantian seluruh fungsi Excel pendukung.

## 3. Alur Bisnis Final

### 3.1 Penjualan sampai pembayaran

```text
Quotation atau Sales Order
-> Approval jika harga berbeda dari master
-> Customer PO atau transaksi tunai
-> Delivery dan DO/Surat Jalan
-> Stok keluar dan realisasi PO
-> Invoice dari delivery yang sudah selesai
-> Payment Receipt dan Allocation
-> Piutang dan Rekonsiliasi
```

- Quotation bersifat opsional.
- Customer PO wajib untuk transaksi kontrak atau kredit.
- Penjualan tunai memakai Sales Order tanpa Customer PO.
- Semua pengeluaran barang tetap memiliki Delivery/DO, termasuk barang yang diambil customer.
- Invoice dapat menggabungkan beberapa delivery dari customer, proyek, dan periode yang sama.

### 3.2 Produksi dan inventory

```text
Draft produksi
-> Supervisor mengirim data
-> ADMIN fungsi Project Control memverifikasi
-> Posting produksi
-> Bahan baku keluar dari ledger
-> Produk jadi masuk ke ledger
```

- Produksi dicatat per hari dan per plant.
- SC mencatat output Split, Abu Batu, Sirtu Jaw, Pasir Base, dan pemakaian internal.
- BP mencatat mutu beton, output m³, jenis semen, dan pemakaian bahan aktual.
- AMP mencatat AC-WC/AC-BC, output ton, material aktual, aspal curah, dan BBM proses.
- Blending Base A/B menjadi transaksi produksi tersendiri agar bahan tidak dihitung dua kali.
- Mix design disimpan per versi sebagai standar pembanding. Stok memakai pemakaian aktual yang sudah diverifikasi, bukan angka standar.

### 3.3 BBM

```text
Saldo awal + BBM masuk + transfer masuk
- pemakaian - transfer keluar +/- adjustment
= saldo akhir
```

- Pemakaian wajib menunjuk alat, kendaraan, plant, atau kebutuhan nonproduksi.
- Rasio SC dan BP dihitung `liter / m³ produksi`.
- Rasio AMP dihitung `liter / ton produksi`.
- Genset kantor dan alat nonproduksi tidak masuk rasio produksi.
- Rumus Excel lama yang membagi produksi dengan liter tidak digunakan karena berlawanan dengan label Liter/m³.

## 4. Aturan Bisnis Final

1. Status transaksi umum: `Draft`, `Submitted`, `Posted`, `Reversed`.
2. Hanya transaksi `Posted` yang memengaruhi stok, PO, invoice, piutang, dan laporan resmi.
3. Stok negatif ditolak. User harus memperbaiki receipt, produksi, transfer, atau adjustment lebih dahulu.
4. Over-delivery ditolak. PO harus diubah dan disetujui sebelum delivery dilanjutkan.
5. Semua mutasi stok menggunakan inventory ledger. Saldo tidak boleh diketik langsung.
6. Stock opname menghasilkan adjustment setelah disetujui Manager.
7. Harga transaksi disimpan sebagai snapshot agar perubahan master tidak mengubah transaksi lama.
8. Harga khusus customer atau PO diperbolehkan dengan masa berlaku dan approval Manager.
9. Daftar harga 1 Juli 2026 menjadi master harga awal. Ketentuannya LOCO Plant Samalore, belum termasuk PPN, dan minimum pemesanan hotmix 200 ton.
10. Tarif pajak tidak di-hardcode. ADMIN fungsi Finance mengatur tarif aktif dan transaksi menyimpan tarif yang digunakan.
11. Pembayaran sebagian dan satu pembayaran untuk beberapa invoice diperbolehkan.
12. Potongan PPh dicatat terpisah dan mengurangi outstanding setelah bukti diterima.
13. Kelebihan pembayaran dicatat sebagai dana customer belum dialokasikan.
14. Status invoice: `Draft`, `Issued`, `Partially Paid`, `Paid`, `Cancelled`. Status pembayaran dihitung sistem.
15. Aging piutang memakai tanggal jatuh tempo dengan kelompok 0-30, 31-60, 61-90, dan lebih dari 90 hari.
16. Periode laporan mingguan mengikuti pola lama: M1 tanggal 1-7, M2 tanggal 8-14, M3 tanggal 15-21, M4 tanggal 22-akhir bulan.
17. ADMIN fungsi Project Control menyiapkan checklist dan mengajukan closing/reopen; MANAGER yang bukan maker menyetujui; sistem otomatis mengubah status periode. Periode tertutup tidak dapat diubah tanpa reopen yang diaudit.
18. Nomor dokumen dibuat sistem. Dokumen issued tidak dihapus; pembatalan beralasan mempertahankan nomor dalam riwayat dan nomor tidak dipakai ulang.
19. Master tidak dihapus permanen. Data yang tidak digunakan diberi status nonaktif.
20. Semua posting, approval, reversal, perubahan master, export, dan perubahan konfigurasi dicatat dalam audit log.

## 5. Normalisasi Master Data

| Data lama | Keputusan sistem |
| --- | --- |
| Split 1-2 | Nama resmi `Split 1.2`; nama lama menjadi alias |
| Split 2-3 | Nama resmi `Split 2.3`; nama lama menjadi alias |
| Split 3-5 | Nama resmi `Split 3.5`; nama lama menjadi alias |
| Aggregate A, Base A, LPA, Bass A | Satu item resmi `Agregat Kelas A`; istilah lain menjadi alias |
| Aggregate B, Base B, LPB | Satu item resmi `Agregat Kelas B`; istilah lain menjadi alias |
| Sirtu dan Sirtu Jaw | Tetap menjadi dua item berbeda |
| Pasir, Pasir Base, Pasir Beton | Tetap menjadi tiga item berbeda |
| Semen Tonasa/Tipe I dan Semen Tipe V | Item berbeda; unit stok `sak 50 kg` dengan konversi ke kg dan ton |
| Aspal Curah | Bahan baku dalam ton |
| AC-WC dan AC-BC | Produk jadi dalam ton |
| Concrete Ready Mix | Produk jadi berdasarkan mutu, dalam m³ |
| BBM | Disimpan dalam liter dan per tangki/lokasi |

Setiap material memiliki kode, nama resmi, alias, kategori, UOM utama, UOM konversi, plant, status aktif, dan jenis persediaan.

## 6. Role dan Tanggung Jawab

| Role | Tanggung jawab |
| --- | --- |
| SUPERADMIN | User, role, konfigurasi, integrasi, dan dukungan teknis; tidak menginput atau menyetujui transaksi bisnis |
| DIREKTUR | Melihat dashboard dan laporan sesuai cakupan; kesehatan hanya status/ringkasan |
| ADMIN | Fungsi Project Control: operasi, closing/reopen, surat/lampiran umum, dan data fisik aset. Fungsi Finance: invoice, pajak, pembayaran, lampiran keuangan, parameter aset, dan verifikasi depresiasi. Kedua fungsi memakai role ADMIN, bukan role baru. |
| MANAGER | Melihat data bisnis dan memberi approval wajib; bukan maker permintaan yang disetujui |
| HSE | Detail WCU/DCU dan inspeksi HSE |

- Cakupan plant dan fungsi ADMIN dibatasi sesuai matriks permission; pemisahan maker dan approver tetap berlaku.
- HSE dapat melihat detail kesehatan. Manager dan Direktur hanya melihat status kerja atau ringkasan, bukan seluruh nilai pemeriksaan medis.
- Maker tidak boleh menyetujui transaksi yang dibuatnya sendiri untuk transaksi yang memerlukan approval.

## 7. Approval Wajib

Approval Manager diperlukan untuk:

- harga berbeda dari harga master atau kontrak aktif;
- perubahan nilai/volume Customer PO;
- stock adjustment dan CSR/internal issue;
- reversal transaksi posted;
- pembatalan invoice issued;
- closing dan pembukaan kembali periode;
- surat yang dikonfigurasi wajib approval serta pembatalan surat issued;
- koreksi parameter keuangan aset;
- perubahan konfigurasi yang memengaruhi perhitungan.

## 8. Migrasi Data

### Data yang dimigrasikan

1. Master material, produk, UOM, harga, customer, supplier, proyek, plant, equipment, aset, dan pekerja.
2. Saldo awal stok per material dan plant pada tanggal cut-off.
3. Saldo awal BBM per tangki.
4. Customer PO yang masih aktif dan sisa volumenya.
5. Invoice yang belum lunas, pembayaran terkait, dan saldo piutang.
6. Equipment, aset, status inspeksi, pekerja, WCU/DCU terakhir, dan register surat aktif.

### Data yang tidak dimigrasikan penuh

- Detail transaksi lama yang sudah selesai tetap berada dalam arsip Excel.
- Data historis hanya diimpor jika diperlukan untuk saldo berjalan atau laporan tahun aktif.
- File sumber disimpan utuh dan diberi checksum agar dapat dibuktikan tidak berubah.

### Pembersihan sebelum import

- samakan nama customer, material, equipment, kendaraan, dan pekerja;
- ubah tanggal teks menjadi tanggal valid;
- periksa nomor invoice/PO yang memiliki tahun atau format tidak konsisten;
- hilangkan baris kosong, subtotal manual, dan formula laporan;
- rekonsiliasi stok, BBM, PO aktif, invoice, pembayaran, dan piutang pada tanggal cut-off;
- minta tanda tangan PIC operasional (ADMIN fungsi Project Control), PIC keuangan (ADMIN fungsi Finance), dan MANAGER sebelum data dipromosikan ke production; kedua PIC memakai akun berbeda.

## 9. Arsitektur Teknis

| Komponen | Keputusan |
| --- | --- |
| Backend | PHP 8.3 dan Laravel 12 |
| UI web | Blade, Livewire, Alpine.js, dan Tailwind CSS |
| Admin CRUD | Filament untuk master dan konfigurasi |
| Database | PostgreSQL 16 |
| Cache dan queue | Redis |
| Akses lapangan | Responsive web dan PWA; offline hanya menyimpan draft produksi, BBM, dan inspeksi, lalu disinkronkan untuk diverifikasi |
| Server | Monolith pada VPS production 4 vCPU, RAM 8 GB, SSD 100 GB; staging terpisah |
| File | Object storage kompatibel S3 untuk bukti dan dokumen |
| Repository | Git private dengan review dan CI/CD |
| Keamanan | HTTPS, rate limit login, session timeout, permission per action, audit log, dan secret di luar repository |
| Backup | Database harian dengan retensi 30 hari, backup file mingguan 12 minggu, dan uji restore bulanan |
| Monitoring | Error monitoring, uptime check, job/queue monitor, dan log terpusat |

Arsitektur microservice, Kubernetes, dan aplikasi mobile native tidak digunakan karena tidak sebanding dengan kebutuhan sekitar 30 user dan 20 user bersamaan.

## 10. Dokumen yang Disiapkan Sebelum Coding

1. Project Scope dan Scope Baseline.
2. As-Is dan To-Be Business Process.
3. Actor, Role, Permission, dan Approval Matrix.
4. Functional dan Non-Functional Requirements.
5. Business Rule Catalog dan Acceptance Criteria.
6. Use Case, workflow, dan status transition.
7. Master Data Dictionary dan aturan normalisasi.
8. ERD dan rancangan inventory ledger.
9. Sitemap, daftar layar, wireframe, dan prototype.
10. Product Backlog, release plan, dan test scenario.
11. Data Migration Mapping, cleansing rules, dan reconciliation template.
12. Deployment, backup, rollback, user manual, dan UAT sign-off.

Coding dimulai setelah item 1-9 disetujui. Item lain dapat diselesaikan paralel mengikuti modul yang dikerjakan.

## 11. Tahapan Pengerjaan

| Periode | Hasil |
| --- | --- |
| Minggu 1-2 | Finalisasi proses, business rule, scope, role, dan backlog |
| Minggu 3-4 | ERD, arsitektur, UI/UX, setup repository, staging, auth, role, dan audit |
| Minggu 5-8 | Master data, quotation, Customer PO, delivery, dan DO/Surat Jalan |
| Minggu 9-12 | Produksi SC/BP/AMP, blending, inventory ledger, receipt, dan stock opname |
| Minggu 13-15 | BBM, rasio, invoice, payment, allocation, piutang, dan closing |
| Minggu 16-18 | Dashboard, laporan, export, PWA draft, dan integration test |
| Minggu 19-20 | Migrasi inti, UAT, pelatihan, perbaikan, dan Core Go-Live |
| Minggu 21-26 | Dokumen/surat, equipment/aset, HSE/SDM, inspeksi, dan Complete Go-Live |
| Setelah go-live | Hypercare 4 minggu dan penutupan proyek |

Tim ideal terdiri dari satu Tech Lead/Backend, dua Fullstack Developer, dan satu PIC PT AJA yang tersedia minimal empat jam per minggu untuk review dan UAT.

## 12. Kriteria Penerimaan

Sistem dapat dinyatakan siap go-live jika:

1. Delivery yang diposting hanya sekali mengurangi stok dan realisasi PO.
2. Produksi posted menghasilkan mutasi bahan baku dan produk jadi yang dapat ditelusuri.
3. Saldo stok sama dengan saldo awal ditambah seluruh mutasi ledger.
4. Saldo BBM dan rasio liter per output terhitung benar.
5. Total invoice dikurangi pembayaran, PPh, dan alokasi sama dengan piutang.
6. Transaksi periode tertutup tidak dapat diubah tanpa reopen yang diaudit.
7. Setiap role hanya melihat menu, data, dan action yang diizinkan.
8. Data migrasi direkonsiliasi dan ditandatangani pemilik data.
9. Export XLSX/PDF sesuai angka pada layar.
10. Backup berhasil dipulihkan pada uji restore.
11. UAT alur penjualan, produksi, stok, BBM, invoice, dan laporan dinyatakan lulus.

## 13. Tidak Termasuk Proyek Saat Ini

- general ledger dan laporan keuangan lengkap;
- payroll, absensi, dan perhitungan gaji;
- purchase request, purchase order supplier, serta hutang usaha lengkap;
- pelaporan pajak otomatis ke sistem pemerintah;
- maintenance work order dan sparepart lengkap;
- QC laboratorium, HPP produksi, predictive analytics, dan anomaly detection lanjutan;
- GPS, IoT, weighbridge otomatis, QR verification, dan aplikasi mobile native;
- multi-company dan konsolidasi PT AJA dengan perusahaan lain;
- notifikasi WhatsApp/email otomatis.

Fitur tersebut hanya dapat masuk setelah Core Go-Live melalui change request, estimasi, dan persetujuan baru.

## 14. Sumber Keputusan

Keputusan disusun dari:

- `PC-LAPORAN PT. AMEERA JAYA ABADI SEPTEMBER.xlsx`;
- `CC - AMEERA JAYA ABADI.xlsx`;
- `Lap Material Asphal Balai .xlsx`;
- `Daftar Harga Material PT. AJA Juli 2026.pdf`;
- `BRIEF.docx`;
- `rancangan-sistem-pt-aja versi 1.pdf`;
- `Feature-Website-Overview-Project-Control-PT-AJA.md`.

Dokumen ini menggantikan asumsi yang bertentangan pada rancangan sebelumnya. Perubahan setelah baseline harus masuk Change Request dan tidak boleh langsung diberikan kepada developer melalui pesan informal.
