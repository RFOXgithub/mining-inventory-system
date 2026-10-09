# Acuan Pembaruan QuarryFlow — Project Control PT Ameera Jaya Abadi

**Versi:** 1.0  
**Tanggal:** 2 Oktober 2026  
**Tujuan:** menjadi satu acuan fitur, aturan bisnis, jawaban teknis, UI, data, pengujian, dan migrasi untuk menyesuaikan website QuarryFlow yang sudah ada dengan kebutuhan Project Control PT AJA.  
**Status:** konsolidasi baseline 29 September 2026 dan rekomendasi engineering. Bukan bukti pengesahan asumsi operasional oleh PT AJA.

## 1. Cara menggunakan dokumen

Dokumen ini menggabungkan:

1. `Keputusan Digitalisasi-Project-Control-PT-AJA.md` — sumber tertinggi untuk keputusan bisnis dan scope yang sudah final.
2. `Blueprint Development Website Project Control PT. Ameera Jaya Abadi.md` — sumber rincian modul, feature ID, dependencies, backlog, dan kebutuhan engineering.
3. `Feature-Website-Overview-Project-Control-PT-AJA(2).md` — sumber struktur menu, halaman, dan pengalaman pengguna.
4. Dua puluh tiga pertanyaan operasional pengguna — dijawab pada Bagian 4 dan diterjemahkan menjadi kebutuhan sistem.

Jika sumber bertentangan, gunakan Keputusan final. Status TBD lama yang sudah dijawab oleh Keputusan final tidak menjadi blocker baru. Detail yang belum dijawab tetap dicatat sebagai data atau keputusan terbuka.

| Penanda | Arti | Perlakuan implementasi |
| --- | --- | --- |
| FINAL | Tertulis dalam file Keputusan final | Terapkan sesuai baseline |
| REKOMENDASI | Pilihan rancangan oleh software engineer untuk melengkapi detail | Bisa dibangun sebagai draft/configuration; catat sebelum aktivasi resmi |
| DATA TERBUKA | Fakta perusahaan, tarif, identitas, spesifikasi, atau parameter belum tersedia | Jangan mengarang nilai; gunakan status belum diverifikasi dan validasi saat aktivasi |
| PERLU CR | Tambahan/perubahan yang melampaui atau mengubah baseline | Masukkan Change Request dengan scope, dampak, dan persetujuan |

**Batas pemeriksaan:** repository, database, deployment, dan website QuarryFlow lama belum diperiksa dalam penyusunan dokumen ini. Mapping pada Bagian 11 adalah rencana audit dan perubahan, bukan pernyataan bahwa fitur lama sudah berjalan. Workbook Excel, daftar harga asli, matriks izin XLSX, dan katalog aturan bisnis XLSX yang dirujuk tiga sumber juga belum diverifikasi langsung.

Dokumen ini lengkap sebagai acuan kerja, tetapi tidak menggantikan ERD fisik, kontrak API, matriks permission terperinci, dan pengesahan parameter perusahaan. Implementer harus menghasilkan artefak tersebut berdasarkan acuan ini dan repository aktual.

## 2. Sasaran, batas scope, dan tahap rilis

### 2.1 Sasaran

- QuarryFlow menjadi aplikasi web modular satu perusahaan dengan banyak plant: Stone Crusher (SC), Batching Plant (BP), dan Asphalt Mixing Plant (AMP).
- Website menjadi sumber data resmi setelah cut-over. Excel lama menjadi arsip baca-saja.
- Data dimasukkan sekali pada proses asal. Modul berikutnya memakai referensi transaksi tersebut.
- Transaksi posted tidak diubah/dihapus langsung. Koreksi memakai reversal atau adjustment beralasan dan diaudit.
- Hak akses mencakup role, fungsi, plant, dan action. Menyembunyikan menu saja tidak cukup.
- Operasional inti tersedia pada Core Go-Live; pendukung selesai pada Complete Go-Live.

### 2.2 Scope rilis

| Tahap | Fitur wajib |
| --- | --- |
| Tahap 1 / Core | Dashboard; master; quotation/SPH; sales order; Customer PO; harga kontrak; delivery/DO/SJ; produksi SC/BP/AMP dan blending; receipt; inventory ledger; stok/opname/adjustment; CSR/internal issue; BBM; invoice; payment/allocation; PPh; piutang/aging/rekonsiliasi; approval; closing; laporan/export; audit; migrasi; PWA draft produksi dan BBM |
| Tahap 2 / Complete | Pusat dokumen dan surat lengkap; data fisik/keuangan aset; depresiasi; WCU/DCU; pekerja; inspeksi, foto, temuan, PIC, follow-up; PWA draft inspeksi setelah modul inspeksi tersedia |
| Detail tambahan yang perlu CR | Retur dengan credit note/penggantian layanan; billing sewa berbasis pemakaian; penagihan ulang BBM ABT; pencatatan oli operasional jika belum tercakup; kebijakan baru yang mengubah posting/approval |

Master equipment/kendaraan/pekerja minimum tersedia pada Tahap 1 karena menjadi referensi delivery dan BBM. Manajemen aset keuangan dan HSE lengkap tetap Tahap 2. Lampiran DO, invoice, dan pembayaran wajib tersedia pada Tahap 1; pusat register surat lintas proses baru Tahap 2.

### 2.3 Di luar baseline

Full accounting, general ledger, neraca/laba rugi lengkap, payroll, absensi, supplier procurement lengkap, AP lengkap, integrasi pajak pemerintah, maintenance work order/sparepart lengkap, QC laboratorium, HPP, GPS/IoT/weighbridge otomatis, QR verification, mobile native, multi-company, serta notifikasi WhatsApp/email otomatis.

Fitur di luar scope yang sudah ada di QuarryFlow tidak langsung dihapus. Audit dependency dan datanya; sembunyikan atau arsipkan melalui konfigurasi setelah dampak diketahui. Jangan memperluas scope hanya karena menu lama sudah tersedia.

## 3. Keputusan lintas modul yang wajib konsisten

| ID | Aturan |
| --- | --- |
| BR-001 | Semua perubahan saldo berasal dari ledger dengan referensi sumber; saldo tidak diketik langsung |
| BR-002 | Stok negatif ditolak saat posting, termasuk ketika beberapa user memproses bersamaan |
| BR-003 | Over-delivery ditolak; perubahan PO disetujui Manager sebelum pengiriman dilanjutkan |
| BR-004 | Delivery posted mengurangi stok dan merealisasikan PO tepat sekali; quotation, SO, dan invoice tidak mengurangi stok lagi |
| BR-005 | Produksi posted mengurangi bahan aktual dan menambah output; blending merupakan produksi terpisah |
| BR-006 | Harga, unit, konversi, pajak, dan parameter perhitungan transaksi disimpan sebagai snapshot/version |
| BR-007 | Maker tidak boleh menjadi approver transaksi sendiri; SUPERADMIN tidak input/approve transaksi bisnis |
| BR-008 | Periode tertutup menolak posting/backdate/reversal yang mengubah periode tersebut, kecuali reopen disetujui dan diaudit |
| BR-009 | Permintaan berulang tidak menghasilkan ledger, allocation, dokumen, atau depresiasi ganda |
| BR-010 | Transaksi resmi, dashboard resmi, dan export resmi memakai data efektif yang posted/issued sesuai model status; draft tidak masuk total resmi |
| BR-011 | Master nonaktif mempertahankan histori; dokumen issued yang dibatalkan mempertahankan nomor |
| BR-012 | Audit mencatat posting, reversal, approval, perubahan master, export, dan konfigurasi beserta actor dan alasan |
| BR-013 | Koreksi sumber yang sudah memiliki turunan harus mengecek dependency; tidak boleh menyisakan invoice/payment/stock yang tidak konsisten |

## 4. Jawaban software engineer atas 23 pertanyaan

Jawaban berikut menentukan perilaku website. Jawaban tidak boleh digunakan untuk mengklaim fakta lapangan yang belum tersedia.

### Q01 — Sirtu dan Sirtu Jaw

**Jawaban — FINAL:** keduanya adalah dua material berbeda menurut baseline. `Sirtu Jaw` merupakan output Stone Crusher; `Sirtu` tetap master terpisah. Jangan menyamakan dua istilah hanya karena penjualan dan produksi memakai nama berbeda.

**Implementasi:** berikan kode material berbeda, stok berbeda, histori berbeda, dan pilihan item berbeda di sales/produksi. Penggunaan komersial Sirtu, asalnya, dan kemungkinan salah label dalam Buku Besar adalah DATA TERBUKA. Baris historis yang belum jelas masuk exception mapping, bukan auto-merge. Jika kemudian perusahaan membuktikan keduanya satu item, perubahan membutuhkan CR dan mapping histori yang diaudit.

### Q02 — Split 0.5 / Batu 3/8 dan Split 1.2 / Batu 1/2

**Jawaban — DATA TERBUKA:** tiga dokumen tidak membuktikan kesetaraan spesifik tersebut. Label ukuran produk bukan UOM; nama lokal tidak cukup untuk memastikan spesifikasi/gradasi sama.

**Implementasi:** gunakan nama canonical yang tersedia: Split 0.5, Split 1.2, Split 2.3, Split 3.5. Tambahkan kolom spesifikasi/gradasi, sumber spesifikasi, alias, dan status verifikasi. `Batu 3/8` dan `Batu 1/2` belum boleh otomatis dipetakan sampai PIC mengesahkan spesifikasi. UI boleh menampilkan calon alias dengan label belum diverifikasi, tetapi import tidak boleh menggabungkan stoknya.

### Q03 — Tarif pengiriman per ritase

**Jawaban — REKOMENDASI:** gunakan master tarif angkut berdasarkan tujuan/zona, jenis kendaraan, periode berlaku, dan satuan tagihan. Jarak menjadi parameter bila tarif perusahaan memang berbasis jarak. Tarif tidak otomatis diasumsikan sama untuk semua kendaraan/customer.

**Perhitungan:** jika basis per rit, biaya = jumlah rit valid × tarif per rit. Jika basis per ton/m³/km/lumpsum, hitung sesuai basis kontrak yang terpilih. Jangan mengalikan beberapa basis sekaligus tanpa komponen yang eksplisit.

**Implementasi:** pisahkan harga material, ongkos angkut yang ditagih customer, dan biaya angkut internal. Simpan snapshot tarif di SO/delivery/invoice. Customer pickup dapat memiliki ongkos tagih nol, tetapi nol harus hasil pilihan term, bukan asumsi untuk semua transaksi. Tarif aktual, definisi satu rit, overtime/tol, dan status pajaknya adalah DATA TERBUKA. Deviasi dari tarif kontrak/master masuk approval harga. Mesin tarif terperinci adalah rekomendasi pelengkapan, bukan fakta tarif yang sudah final.

### Q04 — Pengiriman melebihi Customer PO

**Jawaban — FINAL:** sistem memblokir over-delivery. Tidak tersedia tombol bypass untuk mengirim melebihi volume PO hanya dengan approval delivery.

**Implementasi:** Admin PC mengajukan amendment PO dengan volume/nilai baru, alasan, dan lampiran. Manager menyetujui; sistem membuat versi PO baru; delivery memakai versi yang sah. Validasi quantity dilakukan per baris produk dan UOM pada posting. Reservation pengiriman direkomendasikan agar beberapa rencana tidak memakai sisa PO yang sama; reservation tidak menjadi realisasi dan tidak mengubah ledger.

### Q05 — Retur atau pengiriman ditolak

**Jawaban — REKOMENDASI/PERLU CR:** riwayat kejadian perusahaan belum diketahui. Sistem membutuhkan pencatatan accepted, rejected, dan returned quantity agar quantity invoice tidak keliru. Kebijakan retur lengkap belum dijelaskan baseline.

**Desain yang disarankan:** pembatalan sebelum stock-out tidak membuat stok masuk; barang yang sudah keluar hanya kembali ke ledger setelah physical return diverifikasi. Barang retur ditempatkan pada lokasi karantina/pemeriksaan, bukan otomatis stok siap jual. Quantity masuk kembali hanya yang benar-benar diterima fisik. Material reject yang dibuang/hilang bukan stock-in.

Hubungkan retur ke delivery dan baris produk asli; bedakan retur parsial, gagal kirim, penggantian, dan kehilangan. Pemulihan remaining PO harus sesuai keputusan kontrak, tidak otomatis untuk semua retur. Delivery yang sudah invoiced tidak direverse langsung: Finance menangani dampak billing terlebih dahulu. Credit note/refund perlu CR dengan aturan eksplisit. Sampai kebijakan disahkan, sediakan laporan exception dan reversal terkontrol untuk koreksi yang valid; jangan aktifkan otomatis retur/piutang.

### Q06 — Sewa Mobil

**Jawaban — DATA TERBUKA:** kolom tersebut dapat berarti pendapatan rental, biaya kendaraan pihak ketiga, atau bagian ongkos pengiriman. Jangan menetapkan salah satu sebagai fakta.

**Implementasi:** klasifikasikan data historis sebagai `rental_income`, `transport_charge`, `external_vehicle_cost`, atau `unresolved` setelah verifikasi. Bila merupakan penjualan jasa sewa, buat service item terpisah dari material dengan basis per jam/hari/rit/lumpsum, periode layanan, quantity, tarif, dan bukti layanan. Invoice jasa tidak mengurangi inventory material. Termasuk pendapatan sewa pada baseline; modul rental lengkap berbasis pemakaian membutuhkan penegasan scope/CR. Biaya pihak ketiga tidak masuk pendapatan atau AR customer secara otomatis.

### Q07 — Termin pembayaran

**Jawaban — REKOMENDASI:** simpan payment term per customer/kontrak/PO. Jangan mengarang standar 14/30 hari untuk semua pembeli.

**Implementasi:** field `term_days`, `due_date_basis`, `explicit_due_date`, dan sumber persetujuan. Basis dapat tanggal invoice, tanggal delivery, atau tanggal penerimaan invoice yang dibuktikan. Due date disnapshot saat issue. Tanpa term/basis atau due date eksplisit yang sah, invoice belum boleh diterbitkan sebagai invoice kredit resmi. Contoh uji: term 30 hari kalender dari invoice 1 Oktober 2026 menghasilkan jatuh tempo 31 Oktober 2026; ini contoh, bukan term PT AJA.

**Aging:** tampilkan Belum Jatuh Tempo/Jatuh Tempo Hari Ini terpisah; kelompok overdue mengikuti baseline 0–30, 31–60, 61–90, >90 hari. Gunakan tanggal laporan lokal dan sisa piutang efektif, bukan umur sejak invoice dibuat. Invoice tanpa due date hasil migrasi masuk exception, tidak dianggap belum overdue.

### Q08 — Penerbitan invoice

**Jawaban — FINAL + REKOMENDASI:** invoice bersumber dari delivery selesai dan dapat menggabungkan delivery customer, proyek, serta periode yang sama. Jadwal bulanan/dua mingguan/permintaan belum ditentukan tiga dokumen.

**Implementasi:** master billing schedule per kontrak: per delivery, periodik, atau on-request. User memilih hanya delivery eligible yang belum ditagih. Agregasi tidak mencampur customer/proyek, mata uang, atau ketentuan pajak yang tidak kompatibel. Service rental memakai bukti layanan. Simpan periode tagihan, due date, dan sumber tiap baris. Jadwal berbeda adalah konfigurasi; jangan menjadwalkan issue otomatis sebelum aturan disahkan.

### Q09 — TRANSFER BNI selain BNI PT AJA

**Jawaban — DATA TERBUKA:** pemilik rekening tidak bisa disimpulkan dari label Excel. Jangan menyebut rekening tersebut pribadi atau rekening perusahaan tanpa bukti.

**Implementasi:** master rekening memuat bank, nomor rekening, nama pemilik, ownership type, status verifikasi, status aktif, dan izin penerimaan. Label lama dipertahankan di migration lineage. Rekening belum diverifikasi tidak digunakan untuk receipt posted baru. Jika dana ada di rekening pihak lain, Finance mengesahkan perlakuan dan bukti transfer/penyelesaian; sistem menyajikan exception, tidak membuat jurnal atau menentukan perlakuan pajak berdasarkan nama bank. Rekening penerimaan dan aturan pajak dipisahkan.

### Q10 — Software akuntansi

**Jawaban — FINAL:** QuarryFlow Project Control mencakup keuangan operasional, bukan full accounting. Keberadaan software akuntansi atau akuntan eksternal merupakan DATA TERBUKA dan tidak mengubah baseline secara otomatis.

**Implementasi:** sediakan export detail sales, delivery, invoice, pajak yang dicatat, receipt, allocation, PPh, piutang, stok, dan depresiasi dengan ID referensi, periode, sumber, actor, serta status. Format integrasi dipetakan ketika software tujuan diketahui. Modul jurnal/neraca membutuhkan CR. Laporan aset atau saldo stok operasional tidak boleh diberi label laporan keuangan lengkap.

### Q11 — Pengukuran produksi crusher

**Jawaban — FINAL + DATA TERBUKA:** output SC pada baseline/evidence memakai m³. Cara pengukuran fisik input boulder dan output belum terverifikasi.

**Implementasi:** catat quantity measured, UOM, metode, alat, lokasi stockpile, tanggal, PIC, dan bukti. Bila memakai ritase × kapasitas efektif kendaraan, kapasitas harus terverifikasi per kendaraan dan material. Bila memakai timbangan, catat bruto/tara/netto secara manual sesuai scope; integrasi weighbridge otomatis di luar baseline. Konversi ton↔m³ memerlukan density version per material, bukan konversi universal. Total ritase tidak otomatis sama dengan total produksi.

### Q12 — Asal material quarry

**Jawaban — DATA TERBUKA:** tiga dokumen tidak memastikan boulder berasal dari quarry sendiri atau supplier. Sistem mendukung asal internal dan supplier.

**Implementasi:** receipt memiliki source type, quarry/supplier, material, plant/lokasi, quantity, UOM, tanggal, bukti, dan PIC. Quarry sendiri memakai receipt internal terverifikasi; pembelian memakai supplier receipt tanpa mengharuskan supplier PO. Kuantitas boulder dapat dicatat sebagai inventory untuk traceability. Nilai/HPP sumber quarry sendiri tidak otomatis nol dan tidak otomatis ditetapkan sistem; kebijakan valuasi/HPP di luar baseline. Jangan mengklaim stok mempunyai nilai akuntansi hanya karena kuantitasnya tercatat.

### Q13 — Satuan seluruh material

**Jawaban — FINAL:** gunakan master UOM yang seragam dengan satu UOM stok utama per item dan konversi terverifikasi. Nama produk dan ukuran/gradasi dipisahkan dari satuan quantity.

**Implementasi:** katalog pada Bagian 5 menjadi starter, bukan pengganti daftar harga/stock list asli. Simpan UOM transaksi, quantity asli, faktor konversi snapshot, dan quantity UOM stok. `sak 50 kg` = 50 kg; 1 ton = 1.000 kg. Konversi berbeda dimensi seperti m³↔ton memerlukan density; jerigen↔liter memerlukan kapasitas terverifikasi. Konversi yang tidak tersedia memblokir posting terkait, bukan mengganti quantity dengan angka perkiraan.

### Q14 — AMP produksi atau disewakan

**Jawaban — FINAL:** scope baseline mencakup produksi AC-WC/AC-BC sebagai produk jadi dalam ton, dengan konsumsi material, aspal curah, dan BBM proses. Jadi jalur produksi dan penjualan hotmix harus tersedia.

**Implementasi:** jika AMP juga disewakan, buat jalur service/rental terpisah setelah kontrak dikonfirmasi. Basis sewa per ton/hari/lumpsum, pemilik bahan, tanggungan BBM, dan apakah output menjadi persediaan PT AJA merupakan DATA TERBUKA. Jangan mencatat bahan milik customer sebagai stok milik perusahaan atau memposting output rental ke persediaan PT AJA tanpa ketentuan. Perubahan menjadi AMP rental-only memerlukan CR. Minimum hotmix 200 ton berasal dari baseline harga awal, bukan minimum setiap delivery/rit.

### Q15 — Oli AMP

**Jawaban — DATA TERBUKA:** penggunaan aktual belum diketahui. Oli tidak otomatis diperlakukan sebagai aspal, BBM, atau bahan utama campuran.

**Implementasi:** bila berupa pelumas maintenance, klasifikasikan sebagai consumable terpisah dengan quantity liter, receipt, issue equipment, tanggal, dan purpose. Jika penggunaan proses dibuktikan, beri kategori dan purpose tersendiri. Oli tidak masuk KPI liter BBM per ton. Tracking consumable minimum dapat diajukan sebagai pelengkapan inventory; maintenance work order/sparepart penuh tetap di luar scope.

### Q16 — Stock opname stockpile

**Jawaban — FINAL + DATA TERBUKA:** opname dan adjustment disetujui Manager sudah masuk baseline; metode ukur lapangan belum diketahui.

**Implementasi:** opname menyimpan cut-off, lokasi, material, saldo buku saat cut-off, quantity fisik, metode survey/ukur, bukti, toleransi, PIC, serta selisih. Jika volume geometris digunakan, simpan hasil pengukuran dan referensi perhitungan; metode teknis harus disahkan operasional. Movement setelah cut-off diperhitungkan saat approval/posting agar tidak tertimpa. Adjustment = fisik pada cut-off − saldo buku pada cut-off; Manager menyetujui; ledger adjustment dibuat sekali. Jangan mengganti saldo langsung dengan hasil ukur.

### Q17 — Stok negatif

**Jawaban — FINAL:** blokir total pada posting. Tidak ada approval yang mengizinkan ledger negatif.

**Implementasi:** draft boleh disimpan dengan warning kekurangan, tetapi submit approval tidak berarti boleh melewati validasi stok. Receipt/produksi/transfer/adjustment sah harus selesai dahulu. Validasi juga berlaku pada reversal receipt/output yang akan membuat saldo negatif. Lock dan transaksi database mencegah dua user menghabiskan stok yang sama. Jika stok fisik ada tetapi belum tercatat, perbaiki sumber dengan bukti; jangan membuat adjustment palsu agar transaksi lolos.

### Q18 — Jerigen 31 liter dan HM/odometer

**Jawaban — FINAL + DATA TERBUKA:** BBM memakai liter. Nilai 1 jerigen = 31 liter belum ditetapkan ketiga file sehingga tidak boleh di-hardcode. Keberadaan HM/KM per alat juga belum diketahui.

**Implementasi:** packaging/UOM jerigen dapat diberi faktor 31 hanya setelah verifikasi kapasitas wadah dan tanggal berlaku; simpan quantity wadah, faktor snapshot, dan liter hasil. HM/KM bersifat opsional per equipment yang memiliki meter: previous reading, current reading, delta, dan meter-reset event. Liter/jam atau liter/km adalah monitoring tambahan, terpisah dari KPI liter/m³ dan liter/ton. Aktivasi HM/KM adalah detail scope yang perlu dicatat/CR sesuai baseline.

### Q19 — BBM alat ABT

**Jawaban — DATA TERBUKA:** penanggung biaya dan pihak yang ditagih belum diketahui. Pemakaian fisik tetap mengurangi saldo tangki PT AJA bila dikeluarkan dari tangki tersebut, terlepas dari siapa yang menanggung biaya.

**Implementasi:** usage menyimpan ownership alat, kontrak, payer, cost responsibility, purpose, dan flag eligible production KPI. Jangan menyalin pengecualian Excel untuk DT sewa ABT atau truck mixer tanpa alasan tertulis. Pemakaian nonproduksi tidak masuk KPI produksi; pemakaian produksi yang pembiayaannya berbeda memerlukan aturan inclusion yang terverifikasi. Recharge bukan otomatis invoice; buat daftar kandidat dan proses Finance setelah CR billing disahkan. Hindari mengurangi BBM sekali pada usage lalu sekali lagi pada recharge.

### Q20 — Data alat dan kepemilikan

**Jawaban — DATA TERBUKA:** tidak dapat memilih B 9123 UIT atau B 9175 UIT sebagai data benar tanpa dokumen fisik. Tipe TM, jumlah unit, serta status Asphalt Finisher/PTR juga belum terverifikasi.

**Implementasi:** gunakan equipment ID stabil; plate, serial/chassis number, model, ownership, dan unit count menjadi atribut. Simpan kedua label lama sebagai calon mapping dengan sumber, bukan dua aset aktif otomatis. Periksa STNK/dokumen aset/kontrak sewa dan konfirmasi PIC. Catatan konflik tidak dapat dipromosikan sebagai master terverifikasi. Equipment sewa dapat dipakai delivery/BBM, tetapi tidak otomatis masuk depresiasi aset milik PT AJA.

### Q21 — Penyusutan aset

**Jawaban — FINAL:** metode garis lurus bulanan otomatis. Admin PC mengelola data fisik; Finance mengelola parameter dan memverifikasi depresiasi; koreksi parameter keuangan memerlukan Manager.

**Rekomendasi perhitungan:** depresiasi bulanan = (harga perolehan − nilai residu) / masa manfaat dalam bulan. Nilai buku = harga perolehan − akumulasi depresiasi efektif. Nilai buku tidak melewati nilai residu.

**DATA TERBUKA:** masa manfaat per jenis, nilai residu, tanggal mulai, aturan bulan pertama/prorata, disposal, dan akumulasi cut-off. Jangan mengarang masa manfaat resmi. Job membuat draft batch bulanan unik per aset-periode; Finance berbeda dari maker parameter memverifikasi sebelum posting. Jika maker/verifier Finance tidak tersedia, buat exception untuk penyelesaian permission, bukan verifikasi diri diam-diam. Koreksi terposting memakai reversal/adjustment dan tidak menghitung ulang histori tanpa jejak. Aset sewa tidak masuk depresiasi milik perusahaan secara default. Ini register aset operasional, bukan kebijakan akuntansi/pajak lengkap.

### Q22 — Deret nomor surat

**Jawaban — FINAL + REKOMENDASI:** nomor dibuat sistem dan tidak digunakan ulang. Pilihan deret global atau per jenis belum ditetapkan baseline. Rekomendasi: satu agenda global untuk register, serta nomor resmi per jenis dan tahun; kedua nomor dibedakan agar tidak terkesan dua nomor resmi yang sama.

**Implementasi:** konfigurasi `sequence_scope` (global/per type), format, prefix, tahun, reset period, dan branch/plant bila dibutuhkan. Admin PC mengelola register dan penerbitan; perubahan konfigurasi berdampak perhitungan/penomoran disetujui Manager. Nomor diberikan secara atomic saat issue; preview draft bukan nomor final. Tidak wajib gapless; nomor dibatalkan tetap disimpan. Format contoh seperti `0001/SD/AJA/2026` hanya usulan, bukan standar resmi.

### Q23 — Kode Surat Dukungan

**Jawaban — DATA TERBUKA + REKOMENDASI:** tiga dokumen tidak menetapkan kode resminya. Rekomendasi gunakan `SD` untuk Surat Dukungan dan simpan `SK` sebagai kode Surat Keputusan bila jenis itu digunakan; jangan mengklaim ini kode PT AJA yang sudah sah.

**Implementasi:** document type ID dipisahkan dari code tampilan. Data lama berkode SK harus dibaca dari isi/perihalnya, bukan dipetakan seluruhnya sebagai Surat Dukungan. Perubahan kode berlaku pada dokumen baru setelah pengesahan; nomor historis tidak ditulis ulang. Siapkan field alias/legacy code untuk pencarian.

## 5. Master data dan satuan awal

### 5.1 Katalog material awal

| Item | Jenis | UOM utama | Alias/ketentuan |
| --- | --- | --- | --- |
| Split 0.5 | Output SC/material input plant lain | m³ sebagai starter evidence SC | Alias ukuran inci belum diverifikasi |
| Split 1.2 | Output SC/material input | m³ sebagai starter | Split 1-2 alias; 1/2 inci belum verified |
| Split 2.3 | Output SC/material input | m³ sebagai starter | Split 2-3 alias |
| Split 3.5 | Output SC/material input | m³ sebagai starter | Split 3-5 alias |
| Abu Batu | Output SC/material input | m³ sebagai starter | Spesifikasi tersimpan terpisah |
| Sirtu Jaw | Output SC | m³ sebagai starter | Terpisah dari Sirtu |
| Sirtu | Item persediaan terpisah | Konfirmasi, kandidat m³ | Asal/penggunaan belum verified |
| Pasir Base | Output/material SC | m³ sebagai starter | Terpisah dari Pasir dan Pasir Beton |
| Pasir | Material | Konfirmasi, kandidat m³ | Tidak digabung Pasir Beton |
| Pasir Beton | Material | Konfirmasi, kandidat m³ | Item terpisah |
| Agregat Kelas A | Output blending | m³ sebagai starter | Aggregate A, Base A, LPA, Bass A |
| Agregat Kelas B | Output blending | m³ sebagai starter | Aggregate B, Base B, LPB |
| Semen Tonasa/Tipe I | Bahan BP | sak 50 kg | 50 kg/sak; 1.000 kg/ton |
| Semen Tipe V | Bahan BP | sak 50 kg | Item berbeda dari Tipe I |
| Aspal Curah | Bahan AMP | ton | Konversi kg standar |
| AC-WC / AC-BC | Dua produk jadi AMP | ton | Output dan sales terpisah per produk |
| Ready Mix per mutu | Produk jadi BP | m³ | Satu produk per mutu yang aktif |
| BBM | Persediaan tangki | liter | Jerigen memakai faktor terverifikasi |
| Boulder/Batu quarry | Bahan input SC | DATA TERBUKA | Jangan auto-alias sebelum spesifikasi sah |
| Oli/pelumas | Consumable kandidat | liter, perlu verifikasi | Aktivasi scope disahkan; tidak masuk BBM KPI |
| Sewa/jasa angkut | Service item, bukan stok | jam/hari/rit/ton/m³/lumpsum sesuai kontrak | Quantity layanan tidak menciptakan ledger barang |

Katalog ready mix minimal menampung mutu yang ditemukan pada blueprint: K-100, K-125, K-150, K-175, K-200, K-210, K-225, K-250, K-275, K-300, K-350. Aktifkan hanya produk/spec yang divalidasi; jangan menganggap seluruh mutu diproduksi setiap periode. `Base Course A/B` dari draf menjadi calon alias untuk Agregat Kelas A/B setelah verifikasi mapping, bukan nama resmi baru.

### 5.2 Field master wajib

- Material: kode unik, nama resmi, kategori, jenis persediaan/service, alias, spesifikasi, UOM utama, konversi/version, cakupan plant, status aktif, dan verification status.
- Plant/lokasi: kode, nama, jenis SC/BP/AMP, stockpile/gudang/tangki, cakupan user. Pisahkan jenis plant dari lokasi fisik; jangan memakai satu string sebagai keduanya.
- Customer/proyek: identitas, kontak, alamat, data pajak yang diberikan Finance, proyek, term default, dan kontrak aktif.
- Supplier/quarry: identitas dan asal receipt. Supplier PO/AP tidak diwajibkan.
- Harga/kontrak: item, UOM, harga, currency, LOCO/delivery term, tax treatment, minimum order, berlaku mulai/akhir, versi, approval.
- Rekening: bank, nomor, pemilik, ownership type, status verifikasi, status aktif, permission Finance.
- Equipment/kendaraan: ID, nama, type/model, plate/serial, plant, ownership, operator/driver, kapasitas terverifikasi bila dipakai, active, source mapping.
- Pekerja: ID, identitas minimum, jabatan, kontak/assignment sesuai kebutuhan; data sensitif dibatasi.
- Pajak: kode/jenis, metode/dasar perhitungan, tarif, effective dates, rounding, owner Finance, version; tidak terkait otomatis dengan nama rekening bank.
- Jenis surat/dokumen: type ID, code, nama, numbering pattern/scope, mandatory attachments, approval policy, retention/access.

### 5.3 Precision dan uang

REKOMENDASI: simpan uang dan quantity menggunakan decimal exact, bukan floating point. Tentukan precision quantity per UOM; rate/amount disimpan dengan skala yang ditetapkan Finance. UI memakai format Indonesia; database tidak menyimpan string `1.000,50` sebagai angka. Pembulatan per baris/total harus dipilih dan diuji, serta snapshot pada transaksi. Jangan menetapkan tarif pajak aktual melalui dokumen ini.

## 6. Role, fungsi, permission, dan approval

### 6.1 Lima role final

| Role/fungsi | Pekerjaan | Pembatasan |
| --- | --- | --- |
| SUPERADMIN | User, role, permission, konfigurasi teknis, monitoring/integrasi | Tidak input atau approve transaksi bisnis; akses file kesehatan tidak otomatis diberikan |
| DIREKTUR | Dashboard dan laporan bisnis sesuai scope | Tidak otomatis maker/approver; kesehatan hanya status kerja/ringkasan |
| ADMIN fungsi PC | Master operasional, SO/PO, delivery, produksi, stock, BBM, request approval, closing, surat, fisik aset | Tidak menjalankan action Finance hanya karena role sama; tidak approve sendiri |
| ADMIN fungsi Finance | Invoice, pajak, rekening, payment, allocation, PPh, piutang, parameter/verifikasi aset, lampiran keuangan | Fungsi/data dibatasi permission; rekening/parameter tidak digunakan sebelum valid |
| MANAGER | Review bisnis dan approval wajib | Bukan maker transaksi yang disetujui; kesehatan hanya ringkasan |
| HSE | WCU/DCU, inspeksi, temuan, follow-up | Detail kesehatan terbatas; tidak diberi akses komersial penuh |

PC dan Finance bukan role baru. Gunakan permission/fungsi serta plant scope dalam role ADMIN. Akun PC dan Finance untuk migration sign-off harus berbeda.

**Supervisor:** jabatan ini bukan role keenam. REKOMENDASI: bila perlu input mandiri, berikan role ADMIN dengan permission terbatas membuat/submitting draft produksi pada plant sendiri, tanpa verify/post/Finance; verifier Admin PC adalah akun berbeda. Jika tidak ada akun lapangan, PC mencatat dengan nama sumber/PIC, tetapi jangan mencatat seolah Supervisor melakukan action login. Penetapan akun dilakukan pada permission matrix sebelum production.

### 6.2 Approval matrix

| Permintaan | Maker | Approver/verification | Dampak setelah disetujui |
| --- | --- | --- | --- |
| Harga khusus/deviasi | ADMIN PC | MANAGER berbeda akun | Snapshot harga berlaku pada transaksi/kontrak yang dimaksud |
| Amendment PO nilai/volume | ADMIN PC | MANAGER | Versi PO baru aktif; remaining dihitung ulang dengan realisasi sah |
| Stock opname/adjustment | ADMIN PC | MANAGER | Ledger adjustment saat posting |
| CSR/internal issue mandiri | ADMIN PC | MANAGER | Stock-out saat posted |
| Reversal transaksi | Fungsi pemilik transaksi | MANAGER | Reversal setelah dependency dan saldo diperiksa |
| Cancel invoice issued | ADMIN Finance | MANAGER | Pembatalan setelah dampak allocation/PPh diselesaikan |
| Closing/reopen | ADMIN PC | MANAGER | Sistem otomatis mengubah periode dengan audit |
| Surat wajib approval/cancel issued | ADMIN PC | MANAGER | Issue/cancel berjejak; nomor tidak dipakai ulang |
| Koreksi parameter aset | ADMIN Finance | MANAGER | Parameter versi baru; histori tidak berubah diam-diam |
| Konfigurasi berdampak perhitungan | Pemilik konfigurasi yang berwenang | MANAGER | Versi efektif baru; SUPERADMIN memasang aspek teknis bila diperlukan |
| Depresiasi batch | Sistem/Finance maker | ADMIN Finance verifier berwenang | Posted setelah verifikasi; rekomendasi pemisahan maker/verifier |

Tidak ada approval tambahan saat issue invoice normal yang diwajibkan baseline; Finance issue sesuai permission dan validasi. Jangan memindahkan approval pembatalan invoice menjadi approval setiap invoice tanpa keputusan.

Pisahkan konsumsi bahan yang otomatis berasal dari produksi verified dan permintaan internal issue mandiri. Konsumsi produksi tidak dibuat lagi sebagai CSR/internal issue. Interpretasi cakupan approval konsumsi produksi perlu dicatat pada business rule catalog; jika juga diwajibkan Manager, gunakan approval atas sumber produksi, bukan dua stock-out.

## 7. Workflow dan lifecycle

### 7.1 Status terpisah

| Domain | Status |
| --- | --- |
| Posting umum FINAL | Draft → Submitted → Posted → Reversed |
| Approval REKOMENDASI | Pending → Approved / Rejected / Cancelled; bukan status stok |
| Delivery operasional REKOMENDASI | Planned → Dispatched → Completed / Failed; posting dibedakan dari perjalanan |
| Invoice FINAL | Draft → Issued → Partially Paid → Paid; Cancelled melalui kontrol |
| Periode REKOMENDASI | Open → Closing Requested → Closed → Reopen Requested → Open |
| Return tambahan | Draft → Submitted → Approved → Physically Received → Posted; aktif setelah kebijakan sah |

Status bisnis dan posting tidak dicampur dalam satu enum. REKOMENDASI: issue invoice melakukan posting tagihan secara atomic; status Issued berarti invoice resmi yang telah posted. Setelahnya Partially Paid/Paid dihitung dari balance, bukan diedit user. Cancelled mempertahankan dokumen, alasan, dan jejak koreksi. Rejected approval mengembalikan sumber ke draft untuk revisi; permintaan lama tetap disimpan.

### 7.2 Penjualan dan pengiriman barang

1. Pilih customer, proyek, plant, item, UOM, quantity, term pembayaran, dan delivery mode.
2. Quotation opsional; SO menjadi sumber order. Harga aktif disnapshot; deviasi meminta Manager.
3. Kontrak/kredit wajib Customer PO. Tunai boleh SO tanpa PO.
4. Rencanakan delivery; pilih kendaraan/driver bila relevan, dan tarif angkut yang sah.
5. Buat DO/SJ untuk setiap pengeluaran barang, termasuk customer pickup.
6. REKOMENDASI event fisik: posting stock-out pada konfirmasi barang keluar plant/dispatch terverifikasi; penyelesaian dan accepted quantity dicatat saat serah terima. Customer pickup dapat dispatch+complete dalam satu action.
7. Stock-out dan realisasi PO dilakukan sekali pada posting dispatch; completion tidak mengurangi stok lagi. Invoice hanya memakai completed/accepted quantity eligible. Event dispatch tersebut adalah rekomendasi detail yang harus disahkan operasional sebelum aktivasi, karena baseline belum menentukan saat fisiknya.
8. Delivery yang belum selesai tetap tampil sebagai barang dalam proses pengiriman; reject/return memerlukan penanganan terkontrol sesuai Q05. Jangan mengembalikan stok ketika barang masih di luar plant.
9. Finance membuat invoice dari delivery eligible, issue, lalu receipt/allocation/PPh.

Harga awal mengacu daftar 1 Juli 2026, LOCO Plant Samalore, belum termasuk PPN. Detail angka tidak dibuat karena file daftar harga asli belum dibaca. Minimum hotmix 200 ton divalidasi pada tingkat order/kontrak yang disahkan; split delivery tidak harus 200 ton setiap rit. Pengecualian minimum order perlu keputusan tersendiri, bukan otomatis approval harga.

### 7.3 Jasa/sewa

SO service → harga/term sah → catatan pelaksanaan layanan → verifikasi → invoice jasa → payment/allocation. Tidak ada stock-out material hanya karena jasa ditagih. Bila jasa mencakup material atau BBM milik PT AJA, mutasi fisik tercatat pada sumber inventory/BBM masing-masing dan hanya sekali. Detail rental usage/billing menunggu Q06/Q14.

### 7.4 Produksi SC/BP/AMP dan blending

1. Draft per hari/plant dengan PIC, shift/batch bila diperlukan, input aktual dan output terukur.
2. Supervisor/PIC mengirim; Admin PC berbeda dari submitter memverifikasi sesuai permission.
3. Validasi material, UOM, konversi, stok bahan, periode, total, dan bukti.
4. Posting atomic: bahan keluar, output masuk, hubungan batch dan audit tersimpan.
5. Mix design version menjadi pembanding; tidak otomatis mengganti actual consumption.
6. Blending Agregat Kelas A/B mengonsumsi komponen lalu menghasilkan output sendiri. Produk blending tidak ditambah sekali di SC dan sekali di blending.
7. Transfer antarplant/stockpile tidak dianggap produksi atau konsumsi. Referensi pemakaian internal SC ke BP/AMP diturunkan dari transfer/consumption sumber, bukan input total kedua.
8. BP fresh concrete dan AMP hotmix dapat masuk-keluar pada hari/batch sama dengan traceability; tidak diasumsikan dapat disimpan tanpa batas. Waste/expired harus berupa movement terkontrol, bukan menghapus produksi.
9. BBM proses AMP mereferensikan BBM usage ID; produksi tidak membuat pengurangan BBM kedua.

Konflik Excel AMP 64,8 vs 48 ton, range SC/KSO, dan subtotal BP merupakan migration exceptions. Tidak menjadi formula target dan tidak menghentikan input aktual baru yang sudah verified. Koreksi histori harus memiliki sumber/bukti dan tidak menyembunyikan nilai asal.

### 7.5 Inventory dan transfer

Saldo per material/lokasi = opening + receipt + output produksi + transfer masuk + retur fisik eligible − consumption produksi − delivery − CSR/internal issue − transfer keluar ± adjustment/reversal efektif.

- Opening dibuat sebagai migration posting satu kali; saldo awal periode berikutnya diturunkan dari ledger, tidak diposting ulang tiap bulan.
- Transfer menyimpan pasangan sumber/tujuan. REKOMENDASI: untuk barang dalam perjalanan gunakan lokasi transit dan receipt tujuan; jangan menambah dua lokasi sekaligus tanpa mengurangi sumber.
- Goods receipt menerima supplier/quarry/internal dengan dokumen dan quantity verified. Tidak harus mempunyai supplier purchase order.
- Internal issue mandiri dan CSR memerlukan approval Manager; consumption produksi memakai sumber produksi.
- Stock opname mengikuti snapshot cut-off pada Q16.
- Negative-stock check berlaku pada semua posting dan reversal yang mengurangi balance.
- Ledger bersifat immutable; projection balance dapat dibangun ulang dan direkonsiliasi.

### 7.6 BBM

Saldo tangki = opening + receipt + transfer masuk − usage − transfer keluar ± adjustment/reversal.

Usage memuat tangki, tanggal, liter, equipment/vehicle/plant/purpose, PIC, source document, ownership/cost responsibility, dan optional meter. Jerigen dikonversi hanya dengan faktor verified. Mutasi BBM memakai fuel ledger yang direkonsiliasi dengan inventory bila keduanya dipakai; pilih satu sumber posting, bukan dua saldo independen untuk liter yang sama.

KPI SC/BP = liter usage produksi eligible / output produksi m³ verified. KPI AMP = liter usage produksi eligible / output ton verified. Zero output menghasilkan N/A dan exception, bukan nol atau pembagian error. Produksi dan liter harus dalam cakupan plant/periode sama; genset kantor/nonproduksi dikeluarkan. Kebijakan truck mixer/angkut/sewa mengikuti konfigurasi yang disahkan, bukan hardcode Excel.

### 7.7 Invoice, pembayaran, PPh, dan piutang

- Invoice line memiliki referensi delivery/service dan quantity billed. Sumber yang sama tidak boleh ditagih melebihi quantity eligible.
- Total invoice dihitung dari line, ongkos layanan/angkut yang sah, discount approved, dan tax rule snapshot. Tarif/dasar pajak bukan hardcode.
- Receipt mencatat uang yang benar-benar diterima. Allocation menghubungkan receipt ke satu atau beberapa invoice customer yang sama; lintas customer memerlukan kebijakan khusus, default ditolak.
- Total allocation aktif ≤ nilai receipt; allocation per invoice tidak melebihi outstanding; overpayment disimpan unallocated customer funds.
- PPh record terpisah dengan bukti, status verified, amount, customer, dan invoice allocation. Jangan membuat receipt uang fiktif dari bukti PPh.
- Outstanding = total invoice efektif − allocation pembayaran posted aktif − PPh verified efektif. Payment header tidak dikurangkan lagi setelah allocation.
- Contoh: invoice Rp10.000.000, receipt Rp6.000.000 yang dialokasikan penuh, PPh verified Rp200.000 → outstanding Rp3.800.000. Contoh angka ini bukan tarif pajak perusahaan.
- Status Paid jika outstanding nol; Partially Paid jika sebagian terselesaikan; Issued jika belum terselesaikan. Unallocated funds tidak otomatis melunasi invoice.
- Allocation/PPh reversal mengembalikan outstanding dan status secara konsisten. Bank charge, write-off, credit note, refund belum menjadi auto-settlement; masuk exception/CR.
- Due date dan aging mengikuti Q07. REKOMENDASI: report as-of dihitung dari event efektif sampai tanggal laporan agar pembayaran kemudian tidak mengubah snapshot histori.

### 7.8 Closing, koreksi, dan cancellation

PC memeriksa receipt, produksi, dispatch/complete, stok negatif, fuel, unbilled delivery, invoice/allocation/PPh, dan critical exceptions. Setelah Finance menyelesaikan rekonsiliasi bagiannya, PC mengajukan closing; Manager approve; sistem mengunci periode.

Reopen menyimpan periode, alasan, transaksi terdampak, requester, approval, dan batas waktu bila ditentukan. Setelah koreksi, lakukan rekonsiliasi dan close ulang. Nomor issued dan histori tidak dihapus.

Reversal memeriksa: period lock, available stock, turunan produksi, delivery invoice, payment allocation/PPh, dan approval. Default blokir bila turunan belum ditangani. Untuk koreksi current-period terhadap transaksi lama, aturan effective date harus disahkan; jangan backdate otomatis. Return bukan selalu reversal penuh: gunakan quantity actual parsial dan alasan sesuai kebijakan.

## 8. Menu dan daftar layar target

Struktur menu boleh berkelompok seperti website lama jika memudahkan pengguna, tetapi fitur wajib dan permission harus sama. Jangan membuat dashboard duplikat yang menghitung KPI dengan definisi berbeda.

| Menu | Layar utama | Tahap | Feature ID sumber/pelengkapan |
| --- | --- | --- | --- |
| Dashboard | Ringkasan sesuai role, plant/periode, approval, exception, drill-down | 1 | M15-F01/F02/F03 |
| Master Data | Material/alias/UOM; plant/lokasi; customer/supplier/proyek; harga/kontrak; rekening/pajak; equipment/vehicle/pekerja minimum | 1 | M02; NEW-M02-PROJECT, CONTRACT, TAX |
| Penjualan | Quotation/SPH, SO barang/jasa, Customer PO/amendment, price approval, histori | 1 | M03/M04; NEW-M03-SO |
| Pengiriman | Planning, kendaraan/driver, DO/SJ, pickup, dispatch, completion/proof, tarif angkut | 1 | M05; NEW-M05-FREIGHT, PICKUP |
| Produksi | SC/BP/AMP, blending, mix design/version, verifikasi, posting, rekonsiliasi | 1 | M06; NEW-M06-BLEND, MIX |
| Inventory | Receipt, transfer, opening/migration, saldo, kartu stok, opname, adjustment, CSR/internal issue | 1 | M07; NEW-M07-TRANSFER |
| BBM | Receipt, usage, transfer tangki, saldo, rasio, exceptions, optional HM/KM | 1 | M08; NEW-M08-TRANSFER |
| Keuangan Operasional | Invoice, billing source, receipt, allocation, PPh/proof, unallocated funds, AR/aging, reconciliation | 1 | M09; NEW-M09-PPH, AGING |
| Approval & Exception | Worklist, before/after, approve/reject, dependency dan history | 1 | M14 |
| Laporan | Katalog; viewer/filter/drill-down; XLSX/PDF; snapshot | 1; pendukung 2 | M15-F04/F05 |
| Dokumen & Surat | Bundle, register, type/numbering, issue/cancel, attachments, preview, arsip | Lampiran inti 1; pusat lengkap 2 | M10 |
| Equipment & Aset | Fisik, ownership, assignment, parameter, draft depresiasi, verifikasi, register buku aset | 2 | M11; NEW-M11-DEPR |
| HSE & SDM | Pekerja detail, WCU, DCU, inspeksi plan/actual, foto/temuan/PIC/follow-up, restricted report | 2 | M12/M13; NEW-M12-DCU |
| Pengaturan | User/role/fungsi/plant/action, periode, audit, config version, migration/data quality | 1 | M01/M16 |
| Tambahan bersyarat | Return/quarantine, service rental usage, BBM recharge, consumable oli | CR sesuai Q05/Q06/Q14/Q15/Q19 | NEW-RETURN, RENTAL, RECHARGE |

Setiap entity operasional memiliki list/filter/search, create draft, detail, edit draft, submit, action berizin, dokumen, sumber/turunan, audit history, dan exception. Halaman posted bersifat read-only dengan action reversal/request correction sesuai permission. UI tidak menawarkan edit balance atau delete posted.

### 8.1 Dashboard dan report definitions

Dashboard menampilkan quantity dan nilai dengan UOM yang jelas. Jangan menjumlahkan ton dan m³ dalam satu total quantity. Sales ordered, delivery dispatched, delivery completed, invoice issued, dan cash received adalah metrik berbeda dan diberi label sesuai event.

Report inti: sales/order, PO ordered-delivered-remaining, delivery/ritase/pickup, produksi SC/BP/AMP/blending, raw consumption, stok/ledger/opname, fuel balance/KPI, invoice/unbilled, payment/allocation/PPh/unallocated, AR/aging, closing, approvals/exceptions. Tahap 2: register surat/dokumen, equipment/depresiasi, inspeksi/WCU/DCU/pekerja dengan akses terbatas.

Report memakai filter plant, lokasi, periode/as-of, customer/proyek/material/status sesuai domain; total di layar, export, dan drill-down memakai query/aturan sama. Pola mingguan FINAL: M1 1–7, M2 8–14, M3 15–21, M4 22–akhir bulan. Mapping seluruh 21 worksheet yang disebut Blueprint harus diverifikasi ketika workbook tersedia; tidak mengarang nama sheet yang belum dibaca.

### 8.2 UI dan design

Pertahankan komponen/layout QuarryFlow yang sudah layak; rapikan setelah audit screenshot dan route aktual. Jangan mendesain ulang seluruh aplikasi tanpa kebutuhan. Form quantity/tanggal cepat, error dekat field, tabel mudah dipindai, action approval jelas, dan label konsisten Bahasa Indonesia.

Arahan tampilan dari konteks pengguna: Manrope; Blue #00A0E3 sebagai primary/active/link; Yellow #FECC00 untuk warning; Red #E31E24 untuk critical/error; Charcoal #434242 untuk teks/sidebar; White #FFFFFF untuk canvas/card. Turunan melalui opacity; desktop 1440 sebagai acuan, responsive untuk lapangan. Ini arahan UI pengguna, bukan klaim bahwa tiga file menetapkan seluruh token tersebut. Gunakan icon system existing atau Lucide sesuai stack, bukan mencampur lucide-react pada Vue. Status juga memiliki teks/icon, bukan warna saja.

Loading, empty, error, forbidden, offline, unsynced, conflict, dan pending approval memiliki state jelas. Detail kesehatan tidak terlihat di dashboard umum maupun export role bisnis. PWA hanya menyimpan data minimum; pemeriksaan medis tidak masuk cache offline default.

## 9. Rancangan data, layanan, dan arsitektur

### 9.1 Konsep entity

| Domain | Entity konseptual |
| --- | --- |
| Akses | user, role, permission, user_function, user_plant_scope, audit_event |
| Master | material/product/service, alias, UOM/conversion_version, plant/location/tank, customer, supplier/quarry, project, equipment, worker |
| Komersial | quotation/lines, sales_order/lines, customer_PO/lines/versions, contract/price_version, freight_rate_version |
| Delivery | delivery/lines, DO/SJ, assignment, dispatch_event, completion/proof, reservation opsional |
| Produksi | production_batch, actual_input, output, verification, mix_design_version, blending source links |
| Inventory | inventory_ledger, balance projection, receipt/lines, transfer/lines, stocktake/snapshot, adjustment, CSR/internal_issue |
| BBM | fuel_receipt, fuel_usage, tank_transfer, fuel_ledger, cost responsibility, optional meter_reading |
| Keuangan | invoice/lines/source_allocations, tax_snapshot, payment_receipt, payment_allocation, PPh/proof/allocation, reversal references |
| Aset | asset_financial_version, depreciation_batch/lines, verification, opening_accumulated_depreciation |
| Dokumen | document_type, sequence, document/file_version, relation, letter/register |
| HSE | WCU/DCU/exam, work_status, inspection_plan/actual, finding/followup/photo |
| Kontrol | period, approval_request/decision, idempotency_key, migration_batch/source_row/mapping/exception/reconciliation |

Schema ini konseptual. Gunakan foreign key, unique constraints, check constraints, index sesuai query, dan decimal exact. Jangan memutuskan schema dari nama sheet Excel semata.

Ledger memuat source type/ID/line, material, lokasi, quantity delta, UOM stok, effective date, recorded timestamp, actor, posting key, reversal reference, dan migration lineage bila perlu. Physical delete dilarang. Transfer/produksi multi-line diposting atomic.

### 9.2 Service boundary

Pisahkan controller/form handler, authorization policy, validator, domain service, repository/query, dan renderer/export sesuai stack aktual. Satu domain posting service dipakai UI online, sync draft, API, dan import approved; jangan menduplikasi formula di frontend.

Layanan inti: PriceResolver; POAmendment/Remaining; DeliveryPosting; ProductionPosting; InventoryPosting; FuelPosting; InvoiceIssue; PaymentAllocation; PPhVerification; PeriodClosing; ReversalDependency; DocumentNumbering; Depreciation; ReportProjection; MigrationReconciliation.

Operation create/update draft, submit, approve/reject, post, reverse/cancel, dan export memiliki action/permission tersendiri. Validasi dilakukan server-side, termasuk IDOR/plant scope. Body tidak dipercaya untuk actor/role/approval/current balance. Pesan error Bahasa Indonesia, konflik data dijelaskan; database error tidak dibocorkan ke user.

### 9.3 Atomicity, concurrency, dan idempotency

- Post mengunci saldo/PO/source yang relevan dan memvalidasi lagi dalam transaksi database.
- Simpan unique posting key per source-event; retry mengembalikan hasil yang sama, bukan ledger baru.
- Invoice source allocation memastikan delivery quantity tidak double-billed.
- Receipt/allocation diproses dengan lock; balance credit tidak overallocated oleh request bersamaan.
- Sequence number dan asset-period depreciation memakai constraint unik.
- Side effects seperti export/render file dilakukan setelah commit/queue; retry job tidak menggandakan transaksi bisnis.
- Optimistic version check untuk draft/amendment mencegah silent overwrite.

### 9.4 Stack target dan QuarryFlow existing

**FINAL dari tiga sumber:** PHP 8.3, Laravel 12, Blade/Livewire/Alpine/Tailwind, Filament untuk master/config, PostgreSQL 16, Redis, S3-compatible files; modular monolith; VPS awal 4 vCPU/8 GB/100 GB; staging terpisah; sekitar 30 user/20 concurrent; bukan microservice/Kubernetes/native mobile.

**Instruksi pembaruan:** audit stack QuarryFlow aktual lebih dulu. Jangan rewrite repository hanya karena dokumen menyebut stack berbeda. Fitur dan domain rules dapat dipetakan ke stack existing; bila existing memakai Vue/Next.js/Prisma atau kombinasi lain, catat mismatch di ADR. Mempertahankan stack berbeda dari baseline adalah opsi CR teknis, bukan keputusan final yang diam-diam mengganti stack. Pilih retain/migrate berdasarkan biaya, risiko data, kompetensi tim, dan deployment; putuskan sebelum migrasi arsitektur luas.

Versi framework di atas disalin sebagai baseline sumber, bukan klaim bahwa itu versi terbaru. Dokumen ini tidak mengarahkan upgrade dependency tanpa audit kompatibilitas.

### 9.5 Security dan operasi

HTTPS, rate limit login, session timeout, least privilege, secrets di luar repo, private object storage, authorized file download, validasi MIME/size, audit akses sensitif, environment separation, CI/CD review, error/uptime/queue monitoring, dan log terpusat.

FINAL backup: database harian retensi 30 hari; file mingguan retensi 12 minggu; uji restore bulanan. REKOMENDASI: object versioning/snapshot dan pencocokan manifest DB-file agar restore harian tidak kehilangan attachment baru sejak backup mingguan. RPO/RTO, availability target, file limit, retensi audit/medis, dan owner recovery adalah keputusan operasional terbuka; jangan mengklaim production ready hanya karena job backup aktif.

### 9.6 PWA dan offline

Offline terbatas draft produksi, BBM, inspeksi sesuai tahap modul. Tidak ada approval/posting/closing/allocation offline. Simpan client draft UUID, version, author/device, plant, timestamp, dan sync status. Server deduplicate UUID, memvalidasi ulang data master/permission/periode, kemudian draft diverifikasi normal. Konflik ditampilkan; tidak last-write-wins diam-diam. Logout/akses dicabut menghapus cache sensitif sesuai kebijakan. Offline availability tidak berarti stok tersedia dijamin.

## 10. Register parameter terbuka dan activation gates

Pengembangan form/master/draft/report preview tetap berjalan. Gate diterapkan pada proses yang membutuhkan parameter tersebut; jangan membekukan semua modul untuk satu data terbuka.

| ID | Parameter/fakta | Sumber pertanyaan | Owner yang disarankan | Gate aktivasi |
| --- | --- | --- | --- | --- |
| OPEN-01 | Penggunaan/asal Sirtu, mapping historical | Q01 | PC/Manager | Import baris unresolved |
| OPEN-02 | Spesifikasi split dan alias inci | Q02 | Operasional/PC | Auto-alias import dan konversi produk |
| OPEN-03 | Tarif/basis angkut, definisi rit, billing tax | Q03 | PC/Finance/Manager | Freight billing final |
| OPEN-04 | Dispatch vs completion event resmi | Q04/Q05/Q08 | Operasional/PC/Finance | Delivery posting activation |
| OPEN-05 | Return, partial reject, PO restoration, billing correction | Q05 | PC/Finance/Manager | Automated return/credit/replacement |
| OPEN-06 | Arti Sewa Mobil dan term service | Q06 | PC/Finance | Mapping historis dan billing jasa terkait |
| OPEN-07 | Term/due date basis per customer/kontrak | Q07 | Finance/Manager | Invoice kredit issue/aging terkait |
| OPEN-08 | Billing schedule per kontrak | Q08 | Finance | Otomatisasi jadwal; manual eligible billing bisa berjalan |
| OPEN-09 | Ownership/izin rekening BNI | Q09 | Finance/Manager | Receipt posted pada rekening tersebut |
| OPEN-10 | Software akuntansi/export destination | Q10 | Finance | Integrasi khusus; export umum tetap berjalan |
| OPEN-11 | Metode ukur, kapasitas/density | Q11/Q16 | Operasional/PC | Konversi dan posting quantity yang memakai faktor itu |
| OPEN-12 | Quarry source/ownership/value policy | Q12 | Operasional/Finance | Source mapping; valuasi/HPP di luar scope |
| OPEN-13 | UOM/katalog final seluruh item | Q13 | PC/Finance | Posting item yang UOM-nya belum sah |
| OPEN-14 | AMP rental scope dan pemilik input/output | Q14 | PC/Finance/Manager | Rental workflow khusus |
| OPEN-15 | Jenis/purpose oli | Q15 | Operasional | Posting consumable baru |
| OPEN-16 | Kapasitas jerigen, meter availability | Q18 | Operasional | Konversi jerigen/HM-KM |
| OPEN-17 | BBM ABT, KPI inclusion, recharge | Q19 | Operasional/Finance | KPI kategori unresolved dan invoice recharge |
| OPEN-18 | Plate/type/unit count/ownership alat | Q20 | PC/pemilik data | Promosi conflicting master |
| OPEN-19 | Useful life/residual/start/prorata aset | Q21 | Finance/Manager | Depresiasi aset terkait |
| OPEN-20 | Sequence scope/pattern dan kode SD/SK | Q22/Q23 | PC/Manager | Surat issued baru dengan format final |
| OPEN-21 | Tax base/rates/effective date/rounding | Tiga sumber | Finance/Manager | Issue invoice terkait |
| OPEN-22 | Cut-off, permission matrix, privacy/retention, RPO/RTO | Tiga sumber | PIC/Manager/teknis | Cut-over domain terkait/production sign-off |

Tidak menjadi pertanyaan terbuka lagi: Sirtu ≠ Sirtu Jaw; reject over-delivery; reject stok negatif; website source of truth; metode garis lurus; lima role; approval Manager; partial/multi-invoice/overpayment; rumus fuel; week M1–M4; supplier receipt tanpa full procurement.

Setiap parameter memiliki value, source/bukti, owner, approved by, effective date, affected features, migration treatment, dan contoh acceptance. Nilai default demonstrasi tidak boleh dipromosikan menjadi parameter production.

## 11. Rencana pembaruan QuarryFlow existing

### 11.1 Audit sebelum edit besar

1. Baca AGENTS.md/instruksi repository, package/composer files, auth, database schema/migration, routes, permission, hosting, dan existing tests.
2. Inventaris layar dan behavior nyata. Bedakan UI mock, API tersedia, serta feature yang benar-benar posted ke database.
3. Petakan existing feature ke feature target pada Bagian 8; beri status Reuse, Extend, Replace, New, Hide/Archive.
4. Audit seluruh jalur mutasi stok, invoice, payment, cancellation, dan dashboard; identifikasi input ganda atau balance yang bisa diedit langsung.
5. Buat backup/checkpoint branch dan rencana migrasi reversible. Jangan drop/truncate data existing.
6. Putuskan stack retain/migrate dengan ADR bila berbeda dari baseline; lanjutkan perubahan kecil yang tidak tergantung keputusan arsitektur besar.

### 11.2 Mapping target terhadap area QuarryFlow yang perlu dicek

| Area existing yang perlu dicari | Perubahan target |
| --- | --- |
| Sales order/quotation | Tambah customer-project-plant, kontrak/harga snapshot, branch tunai/kredit, service lines, price approval |
| Delivery | DO wajib, pickup, assignment, ritase/freight term, source PO/version, atomic stock-out, completion proof |
| Inventory | Ledger immutable dan lokasi, production/receipt/transfer references, negative-stock blocking, opname/adjustment/CSR |
| Produksi | SC/BP/AMP berbeda form; consumption actual; blending; mix version; verify/post; tanpa output ganda |
| Invoice/payment | Delivery billing source, anti-double-bill, tax snapshots, term/due date, allocation, PPh, unallocated funds |
| Suppliers/purchase request/purchase order | Reuse supplier master/receipt; isolasi procurement/AP lengkap di luar target core |
| Equipment/maintenance/sparepart | Reuse verified master; ownership/assignment; tambah aset/depresiasi; maintenance lengkap di luar baseline |
| User/settings | Lima role; fungsi PC/Finance; plant/action policies; no self-approval; SUPERADMIN teknis |
| Reports/dashboard | Satu definisi resmi, filter plant/periode, posting-only, UOM jelas, export reconciled |
| Notifications | Worklist/in-app dapat dipakai; WhatsApp/email otomatis tidak masuk scope saat ini |
| Existing multi-company/tenant | Target satu perusahaan banyak plant; jangan menyamakan tenant dengan plant atau membuka scope lintas perusahaan |

Nama menu existing pada tabel adalah area pencarian berdasarkan konteks QuarryFlow, bukan hasil inspeksi repository.

### 11.3 Urutan implementasi

| Paket | Hasil yang harus selesai | Dependency |
| --- | --- | --- |
| W0 | Audit existing, gap matrix, ADR stack, scope/permission, snapshot data | Repo/data tersedia |
| W1 | Master canonical/alias/UOM/plant/lokasi, auth policies, audit/period, migration staging | W0 |
| W2 | Ledger engine, transactional posting/idempotency, opening/receipt/transfer | W1 |
| W3 | Produksi SC/BP/AMP/blending/mix dan BBM posting | W2 + verified parameters |
| W4 | SO/quotation/contract/PO amendments, delivery/DO/pickup/freight/completion | W1/W2 + event resmi |
| W5 | Invoice/term/tax/payment/allocation/PPh/aging/closing | W4 + Finance parameters |
| W6 | Dashboard/report/export/PWA drafts, integration/UAT/migration rehearsal | W3–W5 |
| W7 | Core cut-over, monitoring, hypercare | Core acceptance lulus |
| W8 | Surat/register; aset/depresiasi; HSE/WCU/DCU/inspeksi; Complete cut-over | W7 + parameter Tahap 2 |
| W9 | CR terpilih: return/rental/recharge/oli | Persetujuan scope dan acceptance khusus |

Jadwal 26 minggu dan tim ideal tiga engineer + PIC dari sumber merupakan baseline planning, bukan estimasi pasti pembaruan QuarryFlow. Estimasi ulang setelah gap audit. Jangan menyatakan website siap production hanya karena tiga tampilan berhasil dibuat.

### 11.4 Instruksi kerja untuk implementer/AI coding

> Audit QuarryFlow existing dan ikuti acuan ini. Reuse komponen dan data yang valid. Buat gap matrix beserta route, model, service, dan migration aktual sebelum perubahan besar. Terapkan baseline final, lalu rekomendasi melalui konfigurasi/version dan gate yang dinyatakan. Jangan mengarang tarif, kepemilikan, plate, spesifikasi, atau term PT AJA. Jangan rewrite stack, menghapus modul/data, mengaktifkan scope CR, atau bypass stok/PO tanpa keputusan. Kerjakan paket berdependency; setiap UI action harus terhubung ke backend dan permission yang tepat bila paket fullstack. Untuk paket UI-only, gunakan mock terlabel dan jangan mengklaim posting berjalan. Selesaikan validation, atomic posting, tests bermakna, migrasi, dan dokumentasi perubahan. Laporkan fitur selesai, bukti verifikasi, parameter terbuka yang membatasi aktivasi, dan risiko deployment.

## 12. Migrasi, rekonsiliasi, dan cut-over

### 12.1 Data aktif yang dibawa

Master terverifikasi; stok awal per material/lokasi; BBM per tangki; Customer PO aktif/sisa; invoice outstanding; receipt/allocation/PPh terkait; unallocated funds; equipment/aset dan akumulasi depresiasi awal; pekerja; WCU/DCU terakhir; inspeksi/register surat aktif sesuai tahap. Historic completed tetap arsip kecuali diperlukan laporan tahun aktif/saldo berjalan.

Jika QuarryFlow sudah mempunyai transaksi ledger sah, jangan memasukkan saldo Excel untuk transaksi yang sama sebagai opening kedua. Tetapkan satu source cut-off dan reconciliation bridge yang menjelaskan data existing + data baru.

### 12.2 Proses

1. Simpan sumber asli/checksum, metadata versi, workbook/sheet/row/cell atau existing ID.
2. Import ke staging; normalize dates/material/customer/plate/document tanpa merusak nilai asal.
3. Pisahkan duplicate, alias unresolved, invoice/proforma nonunique, wrong year, AMP total conflict, dan PO excess sebagai exceptions dengan owner.
4. Mapping ke master/source target; tidak auto-merge nama yang ambigu.
5. Trial migration dan reconciliation count, quantity, amount, remaining PO, fuel, AR, allocation/PPh, dan asset opening.
6. Closing snapshot/cut-off: tetapkan tanggal-waktu, siapa membekukan input, dan delta transaksi antara rehearsal dan production.
7. ADMIN PC, ADMIN Finance dengan akun berbeda, dan MANAGER sign-off; critical unresolved memblokir promosi data terkait.
8. Promosikan batch approved secara idempotent; opening hanya sekali.
9. Rekonsiliasi ulang, role smoke test, training/SOP, lalu website menjadi sumber resmi.
10. Rollback sebelum traffic live memakai checkpoint yang diuji. Setelah ada transaksi baru, rollback harus mempertahankan event/delta; tidak menghapus posting baru atau menghidupkan dua sistem tulis bersamaan tanpa prosedur.

Retensi arsip, akses Excel sumber, dan file kesehatan mengikuti permission. Semua sumber tidak harus tampil untuk semua role hanya karena disimpan sebagai evidence.

## 13. Acceptance criteria dan skenario uji

| ID | Skenario | Hasil wajib |
| --- | --- | --- |
| AC-01 | Sirtu dan Sirtu Jaw dibuat/dimigrasi | ID/saldo berbeda; unresolved tidak auto-merge |
| AC-02 | Alias inci split belum verified | Import memunculkan exception; tidak menyamakan stok |
| AC-03 | Konversi semen 2 sak 50 kg | Setara 100 kg dengan snapshot faktor; kg↔ton konsisten |
| AC-04 | Dua user dispatch untuk PO sisa 10 m³, masing-masing 8 m³ | Maksimal satu posting berhasil; lainnya ditolak/conflict; tidak over-deliver |
| AC-05 | Amendment PO disetujui Manager | Versi baru aktif; requester tidak dapat approve sendiri |
| AC-06 | Stok 5 m³, dispatch 6 m³ | Posting ditolak; saldo/PO/ledger tidak berubah |
| AC-07 | Retry post delivery yang sama | Satu stock-out dan satu realisasi PO; DO/source stabil |
| AC-08 | Produksi posted dengan input actual/output | Ledger input-output atomic; bukan memakai mix standar sebagai actual |
| AC-09 | Blending output Agregat A | Komponen keluar/output masuk sekali; tidak double-output SC |
| AC-10 | Transfer stock/tangki | Sumber/tujuan/transit konsisten; total company tidak bertambah tanpa receipt |
| AC-11 | Customer pickup tunai | SO tanpa PO diizinkan; DO tetap wajib; stock-out sekali |
| AC-12 | Invoice dua delivery customer/proyek sama | Source quantity terikat; sumber yang sudah fully billed tidak dapat ditagih ulang |
| AC-13 | Invoice dari delivery belum completed/accepted | Issue sumber terkait ditolak sesuai rule eligibility |
| AC-14 | Invoice kredit tanpa due date sah | Issue ditolak/exception; tidak membuat aging fiktif |
| AC-15 | Receipt Rp12 juta, allocation invoice Rp10 juta | Rp2 juta unallocated; bukan piutang negatif |
| AC-16 | Payment Rp6 juta + PPh verified Rp200 ribu terhadap Rp10 juta invoice | Outstanding Rp3,8 juta; payment header tidak double-deduct |
| AC-17 | Bukti PPh belum verified | Tidak mengurangi outstanding |
| AC-18 | Allocation bersamaan/berulang | Tidak melebihi receipt/invoice; retry tidak menambah row efektif |
| AC-19 | Aging as-of sebelum/sesudah due date | Belum jatuh tempo terpisah; bucket overdue sesuai tanggal dan saldo saat laporan |
| AC-20 | Fuel SC 100 liter / 50 m³ | KPI 2 liter/m³; genset kantor terpisah |
| AC-21 | Fuel/produksi output nol | N/A dan exception; tidak divide-by-zero |
| AC-22 | Jerigen capacity belum verified | Konversi jerigen→liter/posting terkait ditolak, draft tetap tersimpan |
| AC-23 | BBM usage dirujuk AMP production | Satu fuel-out, bukan dua |
| AC-24 | Opname snapshot dengan movement setelah cut-off | Adjustment berbasis cut-off; movement baru tidak tertimpa |
| AC-25 | Periode closed, request backdate/reversal | Ditolak sampai reopen sah; audit tersedia |
| AC-26 | Reversal delivery sudah paid invoice | Dependency blocker; tidak menghapus tagihan/pembayaran sepihak |
| AC-27 | Cancel draft vs return dispatched material | Tidak ada stock-in tanpa barang fisik returned verified |
| AC-28 | Account BNI unresolved/plate konflik | Tidak aktif sebagai verified source baru; nilai asal tersedia di staging |
| AC-29 | Depresiasi job diulang bulan sama | Satu aset-periode; tanpa parameter sah tidak posted; Finance verification wajib |
| AC-30 | Surat concurrent issue/cancel | Nomor unik, scope benar, nomor cancelled tidak dipakai ulang |
| AC-31 | Rental/service invoice | Tidak mengurangi material inventory secara otomatis |
| AC-32 | SUPERADMIN mencoba post/approve transaksi | Ditolak server-side meskipun endpoint dipanggil langsung |
| AC-33 | User plant SC membaca/mengubah BP tanpa scope | Ditolak query/action/file access, bukan hanya menu disembunyikan |
| AC-34 | Manager/Direktur export WCU/DCU detail | Tidak memperoleh nilai medis; hanya ringkasan yang diizinkan |
| AC-35 | Offline draft disync dua kali dan konflik version | Satu draft source; conflict terlihat; tidak offline-post |
| AC-36 | Report/export dengan filter sama | Total dan drill-down sama; mixed UOM tidak dijumlahkan sebagai satu quantity |
| AC-37 | Migration batch rerun | Tidak double-opening/AR/PO; lineage/source totals dapat ditelusuri |
| AC-38 | Restore DB dan file | Bukti restore dan reconciliation attachment tersedia; RPO/RTO diukur sesuai target yang disahkan |

Tests otomatis diprioritaskan pada izin/plant scope, calculation, concurrency, idempotency, reversal dependencies, allocation/PPh, numbering, depreciation uniqueness, migration, dan report reconciliation. UI diuji untuk form utama, responsive, keyboard, dan state gagal. UAT dilakukan pemilik domain, bukan hanya developer.

## 14. Checklist hasil pembaruan

- [ ] Gap matrix existing vs target beserta evidence repository selesai.
- [ ] Stack/ADR dan scope CR jelas; tidak ada rewrite/destructive migration tersembunyi.
- [ ] Lima role, fungsi PC/Finance, plant/action permission dan maker-checker aktif.
- [ ] Master canonical, alias/UOM, verification status, dan harga/term/tax snapshots tersedia.
- [ ] Ledger/idempotent posting/concurrency dan no-negative/no-overdelivery lulus uji.
- [ ] SC/BP/AMP/blending, transfer, BBM dan stock opname tidak double-count.
- [ ] SO tunai/kredit, DO/pickup, completion/billing eligibility berjalan.
- [ ] Invoice/allocation/PPh/unallocated funds/due date/aging benar.
- [ ] Closing/reopen/reversal dependencies dan audit konsisten.
- [ ] Dashboard/report/export sama dengan sumber resmi.
- [ ] PWA draft sync aman; approval/posting offline tidak tersedia.
- [ ] Surat, aset/depresiasi, WCU/DCU/inspeksi masuk Tahap 2 lengkap.
- [ ] Parameter terbuka memiliki owner, bukti, tanggal efektif, dan activation gate.
- [ ] Migration/cut-off reconciliation dan sign-off tersedia.
- [ ] Backup restore, monitoring, SOP, training, dan rollback diuji.
- [ ] Fitur CR tidak diaktifkan tanpa kebijakan dan acceptance yang disahkan.
- [ ] UAT Core dan Complete ditandatangani sesuai tahap; hypercare 4 minggu direncanakan.

## 15. Hal yang diperbaiki dari ketiga dokumen sumber

1. Source of truth, posting, stock negative, over-delivery, approval, payment dan fuel formula yang sudah final tidak lagi diberi label blocked global.
2. Nama canonical Agregat Kelas A/B dan pemisahan Sirtu/Pasir mengikuti Keputusan, bukan kandidat draf.
3. Sales order tunai/customer pickup, supplier receipt, proyek/kontrak/pajak, blending, PPh, BBM transfer, DCU, depresiasi dan PWA memiliki kebutuhan/layar jelas.
4. Payment dan allocation tidak dikurangkan dua kali dari invoice.
5. Status posting, delivery perjalanan, approval, invoice/payment, dan period dipisahkan.
6. Blending/internal consumption, dispatch/completion, dan AMP BBM tidak membuat stock-out/output ganda.
7. Dashboard/export masuk Core; asset finance/surat/HSE lengkap masuk Complete. Prioritas teknis lama P0/P1/P2 tidak diperlakukan sebagai rilis yang bertentangan.
8. Rekomendasi retur, rental detail, freight, meter, rekening, ownership, numbering, dan parameter aset diberi provenance dan gate; tidak dianggap fakta PT AJA.
9. QuarryFlow existing menjadi objek audit/update bertahap; stack dan data existing tidak diasumsikan sudah sama atau langsung dibuang.

**Acuan pelaksanaan:** gunakan aturan FINAL sebagai baseline; implementasikan detail REKOMENDASI secara terlacak; selesaikan DATA TERBUKA hanya pada domain yang membutuhkan; scope tambahan diproses melalui CR. Tidak perlu mengulang keputusan bisnis yang sudah tertulis final, dan tidak boleh mengganti fakta yang belum diketahui dengan jawaban yang terlihat meyakinkan.
