# Staging, SOP, UAT dan cut-over QuarryFlow

Dokumen operasional untuk instruksi audit 3 Oktober 2026. **Tidak memberi izin deploy, migration production atau promosi data perusahaan.** Bukti otomatis memakai fixture fiktif; sign-off bisnis dan rehearsal pada infrastruktur tujuan masih diperlukan. Hasil akhir tests ada di [PROGRESS](PROGRESS.md).

## Scope dan keputusan

- Core: akses/master, stock ledger, produksi SC/BP/AMP, blending, BBM, quotation/SO, Customer PO/amendment, delivery/pickup/jasa, invoice/receipt/allocation/PPh, approval/closing, report/CSV dan draft PWA.
- Complete: tiga workspace `/documents`, `/assets`, `/inspections`; nomor surat, bundle, register aset/parameter/depresiasi/koreksi, pekerja, pemeriksaan berizin, checklist/temuan/bukti/follow-up dan draft inspeksi.
- CR belum aktif: retur/credit note/refund/write-off, rental usage billing rinci, BBM ABT recharge/oli, AP/procurement/maintenance lengkap, payroll/IoT/multi-company, WA/email otomatis. Tidak menambahkan posting untuk fitur tersebut.
- ADR-001 tetap terbuka: stack Next.js/Prisma dan server uji PostgreSQL 18.6 berbeda dari acuan Laravel/PostgreSQL 16. Tidak melakukan rewrite, downgrade atau menyatakan kepatuhan stack sebelum keputusan teknis.
- File saat ini disimpan sebagai binary private di PostgreSQL, maksimal 4 MiB/file. Bukti Core dapat dilampirkan melalui bundle sumber yang disahkan. Inline attachment DO/invoice/payment, S3-compatible storage, antivirus/retention dan format XLSX/PDF belum ditutup. File klinis tidak menjadi sumber bundle, export umum atau cache offline.

## Paket staging

1. Buat database/schema staging terpisah, akun aplikasi dengan hak minimum dan secret dari secret manager. Jangan menggunakan seed demo untuk mengimpor data perusahaan. Ambil backup DB dan manifest file sebelum perubahan; catat versi source, commit aplikasi dan checksum setiap migration.
2. Terapkan migration **di staging saja**, urut sesuai `prisma/migrations`. Migration `202610030004_stage2` bersifat additive; source/ledger lama tetap ada. Jalankan Prisma validate, aplikasi smoke test, lalu bandingkan count dan constraints sebelum/sesudah. Jangan menjalankan `db push` pada database berisi histori resmi.
3. Simpan Excel asli secara private dan immutable, checksum SHA-256, versi workbook, sheet/row/cell atau existing ID. File kesehatan dipisahkan dengan ACL HSE. CSV/manifest adalah representasi staging; bukan pengganti workbook asli.
4. Mapping verified menyimpan material/UOM/plant/lokasi, party/project/PO/price, plate/serial/ownership, worker dan akun bank. Nama ambigu, Sirtu/Sirtu Jaw, alias inci, nomor proforma/invoice, tahun salah, total AMP konflik, PO excess, BNI unresolved dan plate konflik menjadi exception milik PIC domain. Tidak auto-merge atau mengisi parameter default.
5. Catat setiap exception: lineage, raw value, target usulan, owner, critical/noncritical, keputusan, evidence, pemeriksa dan tanggal. Critical unresolved menahan promosi domain terkait. Tidak menandai verified hanya karena data dapat diparse.

### Trial stock dan BBM yang tersedia

Tool [quarryflow-staging-trial.ts](../../scripts/quarryflow-staging-trial.ts) hanya membaca staging; transaksi diset read-only. Memerlukan `STAGING_DATABASE_URL` yang berbeda dari `DATABASE_URL` dan `STAGING_ACTOR_ID` akun PC berizin/cakupan sesuai. CLI menolak environment production dan tidak memiliki action promote/post/migrate.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/quarryflow-staging-trial.ts manifest.json private-trial-output
```

Manifest divalidasi oleh [trialSchema](../../src/features/inventory/staging-trial.ts): `environment=STAGING`, UUID batch, cutoff ISO, ownerId, sources asli/checksum/versi, mappings target + verifier/evidence, serta rows dengan source/sheet/row/raw cells/domain/quantity/mode. `NEW_OPENING` hanya untuk pasangan material/lokasi tanpa ledger, opening claim atau legacy. `EXISTING_BRIDGE` membandingkan saldo sumber dengan ledger pada cutoff dan tidak menghasilkan opening. UOM harus unit utama verified; BBM harus liter/tangki/policy verified.

Hasil menyimpan lineage, checksum, mapping, source/ledger/delta, totals per plant/domain/UOM, critical exceptions dan proposal UUID stabil. `promotionAuthorized=false` selalu. Rerun proposal memakai UUID sama; perubahan payload ditolak service stock. Proposal yang sudah direview tetap harus melalui sign-off PC, Finance dan Manager terpisah. Tool ini tidak mengimpor AR/PO/worker/medis; adapter tersebut menunggu workbook/mapping dan rehearsal terpisah.

Bukti [staging-trial-fixture.json](../../artifacts/quarryflow-audit/staging-trial-fixture.json) berlabel fiktif: trial berulang menghasilkan proposal sama; satu opening efektif; batch baru untuk pasangan existing ditolak; bridge existing memiliki delta nol. Ini belum trial workbook perusahaan.

## Reconciliation bridge dan anti double-opening

Tentukan **satu** source cutoff untuk setiap pasangan material/lokasi/tangki dan setiap saldo keuangan. Bridge mencatat Excel pada cutoff, ledger sah QuarryFlow pada cutoff, perubahan belum diadopsi, overlap/duplicate, delta sah dan target akhir. Ledger yang sudah sah tetap dipakai. Jangan mengimpor saldo Excel penuh sebagai opening tambahan; delta harus diselidiki dan menggunakan adjustment approved bila sesuai acuan.

| Domain | Rekonsiliasi wajib | Kontrol promosi |
| --- | --- | --- |
| Material/BBM | Count sumber; saldo per item/lokasi/UOM/tangki; receipt-usage-transfer; movement setelah cutoff | Opening claim unik; existing ledger/legacy menolak opening kedua; transfer company tidak menambah total |
| Produksi/blending | Konsumsi aktual, hasil terukur, batch/mutu/tonase, internal issue dan referensi BBM AMP | Atomic input-output; blending transaksi terpisah; referensi usage tidak fuel-out kedua |
| PO/delivery | Commitment, approved amendment, realized, remaining per baris/UOM; DO dan accepted proof | Existing source tidak diimpor sebagai PO baru; overdelivery ditolak; dispatch/completion/invoice dipisah |
| AR | Invoice efektif = allocation + PPh verified + outstanding | Existing invoice/source claim tidak dibuka lagi; invoice/proforma ambiguous ditahan |
| Cash | Receipt efektif = allocation + unallocated; rekening/currency/plant/customer | Header receipt tidak dikurangkan dari AR; PPh bukan receipt; certificate tidak dikreditkan dua kali |
| Aset | Identitas/ownership; cost, residual, opening accumulated, cutoff, posted events dan book | Asset root stabil; rented tidak didepresiasi; satu asset-period; perubahan posted memakai signed adjustment approved |
| Complete/HSE | Nomor issued/cancelled, worker identity, pemeriksaan terakhir, checklist/finding/follow-up, file checksum | Tidak menomori ulang issued; medis private; photo/PIC/follow-up sesuai source |

Totals campuran UOM/currency tidak dijumlahkan sebagai satu angka. Simpan report/export memakai filter plant/as-of yang sama dan snapshot hash. Tolak promosi ketika reconciliation belum nol atau exception critical belum ditandatangani. Import historis tanpa adapter resmi tetap arsip, bukan synthetic transaction yang dianggap bisnis baru.

## Cutoff dan sign-off

Tetapkan jam cutoff WIB, plant/domain, source workbook final, freeze owner, versi aplikasi/migration, snapshot ledger/report, daftar exception, daftar file dan checkpoint. Setelah rehearsal, inventory/PO/AR/cash/fuel/assets delta sampai cutoff final direkonsiliasi ulang. Jadikan Excel read-only setelah cut-over; hanya satu sistem menerima transaksi tulis.

| Sign-off | Akun / keputusan | Status saat dokumen ini dibuat |
| --- | --- | --- |
| ADMIN PC | Master/sumber fisik, produksi, stok/BBM, DO/PO dan counts | Belum diberikan |
| ADMIN Finance berbeda akun | AR/cash/PPh/tax/term/account, asset opening/depreciation dan values | Belum diberikan |
| MANAGER berbeda maker/pemeriksa | Mapping/critical exception/parameter dan persetujuan cutoff | Belum diberikan |
| HSE berizin | Worker, klinis, checklist/finding, file privacy dan perangkat lapangan | Belum diberikan |
| Owner operasional/teknis | Backup/restore, target RPO/RTO, HTTPS/device, monitoring dan izin production | Belum diberikan |

Nomor issued lama/deret surat, parameter aset, event fisik delivery OPEN-04, term/rekening/tax dan matriks izin harus disahkan sesuai domain. Tidak mengganti ketiadaan verifier dengan self-approval. Policy baru hanya berlaku pada source/version yang sesuai; tidak mengubah snapshot histori.

## Rollback dan restore

- Sebelum traffic live: uji restore checkpoint staging beserta evidence/file manifest; ulangi reconciliation counts, saldo dan checksum. Jalankan role/plant smoke test pada hasil restore. Downgrade destructive migration tidak dipakai untuk menghapus source baru; pulihkan checkpoint yang telah diuji bila belum ada delta bisnis.
- Sesudah traffic live: hentikan input, ambil backup baru dan journal delta sejak cutoff. Pertahankan UUID/source lineage, posted events, nomor issued, allocation/PPh dan file baru. Rekonsiliasi delta ke target pemulihan sebelum membuka satu sistem tulis. Jangan restore backup lama lalu kehilangan posting baru atau mengaktifkan Excel dan website secara bersamaan.
- Rehearsal lokal [restore-rehearsal-fixture.json](../../artifacts/quarryflow-audit/restore-rehearsal-fixture.json) memakai `pg_dump/pg_restore`, database tujuan acak milik test, count stock/depreciation/records/exams dan SHA-256 setiap private file. DB tujuan dan dump sementara dibersihkan. Waktu lokal dilaporkan sebagai evidence fixture, **bukan** target RPO/RTO perusahaan atau sign-off restore VPS/S3.

## SOP transaksi dan PWA

1. PC memakai konsumsi aktual/output terukur dan bukti. Submit menyegel source; verifier akun berbeda; posting online. Retry memakai source/UUID sama. Conflict dibandingkan, bukan overwrite. Selisih tidak diselesaikan dengan edit langsung ledger.
2. PC/Finance mengisi quotation/SO/PO/DO/accepted source sesuai grants. Kontrak/kredit wajib PO; tunai boleh SO tanpa PO. Amendment approved mengubah commitment; completion menentukan accepted dan eligibility invoice, bukan stock-out kedua.
3. Finance issue invoice dari source eligible dengan tax/term verified, receipt aktual, allocation sesuai remaining dan PPh peer verified. Manager menyetujui correction; dependency/closed period menahan reversal. Koreksi depresiasi menjadi signed event dan tidak mengubah nominal/source historis.
4. Surat preview tidak mengalokasikan nomor. Issue memakai parameter verified dan approvalRequired; cancel issued diajukan lalu disetujui Manager terpisah. Nomor cancelled tidak digunakan ulang.
5. HSE mengisi checklist aktual, foto/bukti, temuan/PIC/target. Follow-up tidak menutup temuan sebelum verifier terpisah. Pemeriksaan memakai pengukuran dan kesimpulan aktual; tidak ada ambang medis perusahaan yang dikarang. Manager/Direktur hanya ringkasan kerja yang diizinkan.
6. Offline hanya draft produksi/BBM/inspeksi dan referensi minimum. Bukti binary diunggah online. Tidak ada offline exam/approval/posting/closing/payment. Sync revalidasi permission/plant/master/version/period; conflict tampil dan UUID tetap. Logout/revocation/scope change membersihkan data lokal. Uji kebijakan shared device dan expiry sebelum lapangan.
7. Closing PC request, Finance berbeda reconcile, Manager berbeda approve. Source pending termasuk depreciation/correction menahan close; fingerprint berubah bila event berubah. Reopen mengikuti workflow/audit, bukan perubahan langsung flag periode.

## UAT dan acceptance

UAT owner belum dilaksanakan. Tester memakai akun nyata dengan grants minimum dan plant yang benar; hasil dicatat dengan case, input, expected/actual, source ID, screenshot/evidence, defect, retest, owner/date dan keputusan. Fixture otomatis tidak menggantikan tanda tangan owner.

| Acuan | Skenario yang harus direplay owner | Evidence kode otomatis |
| --- | --- | --- |
| AC-01–03 | Canonical/alias/UOM verified; unresolved tidak merge | foundation/access + inventory/operations |
| AC-04–11 | Harga/amendment, race stok/PO, retry, blending/BBM/transfer/pickup | commerce/inventory/operations integration |
| AC-12–19 | Eligible invoice, due, overpayment, PPh, concurrent allocation, historic aging | finance integration dan unit calculation |
| AC-20–24 | KPI liter/output zero, jerigen unresolved, AMP no double fuel, cut-off opname | operations/inventory integration |
| AC-25–28 | Period lock/reopen, dependency reversal, CR return tetap gated, konflik sumber | inventory/finance/commerce integration; konflik workbook nyata masih pending |
| AC-29–30 | Dep job unik, Finance peer, residual/prorata, signed correction; concurrent issued/cancel | stage2 unit/integration |
| AC-31–34 | Jasa no inventory, SUPERADMIN deny, plant/file scope, export medis deny | commerce/finance/access/stage2 integration |
| AC-35–36 | Offline reload/retry/conflict/logout; report/CSV parity/UOM dan source IDs | operations + stage2 Chrome; Core/backend report integration |
| AC-37–38 | Trial rerun/bridge dan restore DB/private files | stage2 staging/restore fixture; perusahaan/VPS/S3 rehearsal pending |

Review visual mempertahankan shell/Field/Dialog/button/card/focus yang sama, dengan composer+preview untuk surat, profile+schedule aset dan checklist+evidence/follow-up HSE. Screenshot desktop/mobile fixture tersedia pada [artifacts/quarryflow-audit](../../artifacts/quarryflow-audit). Tidak menganggap loading screenshot sebagai bukti final layout.

## Kriteria go/no-go

**No-go** bila sign-off di atas belum lengkap, critical exception aktif, double-opening/AR/PO belum diselesaikan, parameter belum verified, restore/reconciliation gagal, permission/plant/file/PWA gagal, atau CR/ADR mengubah scope tanpa keputusan. Tests lokal dapat menunjukkan kesiapan kode; status Core/Complete production tetap bersyarat pada workbook, mapping, UAT, infrastruktur dan cut-over sah. Tidak ada production deployment/migration pada sesi ini.
