import { DocumentStatus, InventoryType, PrismaClient, StockDirection, StockpileStatus, StockpileType } from "@prisma/client";
import { hash } from "bcryptjs";
import { allowedActions, FINAL_ROLES } from "../src/lib/access";

const db = new PrismaClient();
const d = (value: string) => new Date(`${value}T08:00:00+07:00`);

const roles = FINAL_ROLES;
const permissions = [...new Set(roles.flatMap(role => allowedActions(role, ["PC", "FINANCE"])))]

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed tidak boleh dijalankan di production.");
  for (const code of permissions) await db.permission.upsert({ where: { code }, update: { name: code }, create: { code, name: code } });
  for (const code of roles) await db.role.upsert({ where: { code }, update: {}, create: { code, name: code.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ") } });

  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "SUPERADMIN" } });
  const purchasingRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const maintenanceRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const logisticsRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  for (const role of await db.role.findMany({ where: { code: { in: [...FINAL_ROLES] } } })) {
    for (const code of allowedActions(role.code, ["PC", "FINANCE"])) {
      const permission = await db.permission.findUniqueOrThrow({ where: { code } });
      await db.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id } });
    }
  }

  const passwordHash = await hash("QuarryFlow2026!", 12);
  const users = await Promise.all([
    db.user.upsert({ where: { email: "admin@quarryflow.co.id" }, update: { passwordHash, active: true }, create: { email: "admin@quarryflow.co.id", username: "admin", employeeCode: "EMP-001", department: "Management", name: "Andi Rahmat", passwordHash } }),
    db.user.upsert({ where: { email: "purchasing@quarryflow.co.id" }, update: {}, create: { email: "purchasing@quarryflow.co.id", username: "sari.purchasing", employeeCode: "EMP-014", department: "Procurement", name: "Sari Puspita", passwordHash } }),
    db.user.upsert({ where: { email: "maintenance@quarryflow.co.id" }, update: {}, create: { email: "maintenance@quarryflow.co.id", username: "dedi.maintenance", employeeCode: "EMP-027", department: "Maintenance", name: "Dedi Irawan", passwordHash } }),
    db.user.upsert({ where: { email: "logistics@quarryflow.co.id" }, update: {}, create: { email: "logistics@quarryflow.co.id", username: "nina.logistics", employeeCode: "EMP-033", department: "Logistics", name: "Nina Kartika", passwordHash } }),
  ]);
  for (const [user, role] of [[users[0], adminRole], [users[1], purchasingRole], [users[2], maintenanceRole], [users[3], logisticsRole]]) {
    await db.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  }
  await db.user.update({ where: { id: users[0].id }, data: { functions: [], allPlants: false, actionPermissions: allowedActions("SUPERADMIN"), sessionVersion: { increment: 1 } } });
  for (const user of users.slice(1)) await db.user.update({ where: { id: user.id }, data: { functions: ["PC"], allPlants: false, actionPermissions: [], sessionVersion: { increment: 1 } } });
  const admin = users[0];

  const productRows = [
    { code: "AGG-012", name: "Batu Split 1/2", category: "Split", sellingPrice: 285000, minimumStock: 350 },
    { code: "AGG-023", name: "Batu Split 2/3", category: "Split", sellingPrice: 275000, minimumStock: 300 },
    { code: "AGG-SCR", name: "Screening", category: "Screening", sellingPrice: 190000, minimumStock: 250 },
    { code: "AGG-ABU", name: "Abu Batu", category: "Fine Aggregate", sellingPrice: 175000, minimumStock: 250 },
    { code: "AGG-BCA", name: "Base Course A", category: "Base Course", sellingPrice: 235000, minimumStock: 400 },
  ];
  const products = [];
  for (const row of productRows) products.push(await db.product.upsert({ where: { code: row.code }, update: row, create: row }));
  const boulder = await db.material.upsert({ where: { code: "RAW-BLD" }, update: {}, create: { code: "RAW-BLD", name: "Boulder" } });
  const pasir = await db.material.upsert({ where: { code: "RAW-PSR" }, update: {}, create: { code: "RAW-PSR", name: "Pasir Quarry" } });

  const customers = [];
  for (const row of [
    { code: "CUS-001", companyName: "PT Cipta Beton Nusantara", pic: "Budi Santoso", phone: "021-87951244", email: "procurement@cipta-beton.co.id", address: "Jl. Raya Narogong KM 18, Cileungsi, Bogor", customerType: "READY_MIX" },
    { code: "CUS-002", companyName: "CV Karya Beton Mandiri", pic: "Rina Wulandari", phone: "0251-8246610", email: "purchasing@karyabeton.co.id", address: "Jl. Mayor Oking No. 88, Cibinong, Bogor", customerType: "CONTRACTOR" },
    { code: "CUS-003", companyName: "PT Infrastruktur Prima Indonesia", pic: "Fajar Nugroho", phone: "021-5558042", email: "supply@infrastrukturprima.co.id", address: "Kawasan Industri Sentul Blok C-7, Bogor", customerType: "INFRASTRUCTURE" },
  ]) customers.push(await db.customer.upsert({ where: { code: row.code }, update: row, create: { ...row, creditLimit: 1500000000, paymentTerms: 30 } }));

  const suppliers = [];
  for (const row of [
    { code: "SUP-001", name: "PT Teknik Crusher Indonesia", category: "SPARE_PART", materials: ["Jaw Plate", "Bearing"], pic: "Hendra Wijaya", phone: "021-88991200", email: "sales@teknikcrusher.co.id", address: "Kawasan Industri Jababeka, Bekasi", taxInformation: "NPWP 02.345.678.9-411.000" },
    { code: "SUP-002", name: "PT Solar Energi Utama", category: "FUEL", materials: ["Solar Industri"], pic: "Dewi Lestari", phone: "021-55772118", email: "order@solarenergi.co.id", address: "Jl. Industri Raya No. 12, Tangerang", taxInformation: "NPWP 03.120.445.8-451.000" },
    { code: "SUP-003", name: "CV Batu Makmur Abadi", category: "RAW_MATERIAL", materials: ["Boulder", "Base Course"], pic: "Agung Prakoso", phone: "081298341122", email: "admin@batumakmur.co.id", address: "Klapanunggal, Kabupaten Bogor", taxInformation: "NPWP 41.302.881.2-434.000" },
  ]) suppliers.push(await db.supplier.upsert({ where: { code: row.code }, update: row, create: { ...row, paymentTerms: 30 } }));

  const drivers = [];
  for (const row of [
    { code: "DRV-001", name: "Agus Setiawan", phone: "081298765432", licenseNumber: "921401220334", licenseType: "BII Umum", licenseExpiry: d("2027-08-12") },
    { code: "DRV-002", name: "Ahmad Fauzi", phone: "081311224455", licenseNumber: "921401220335", licenseType: "BII Umum", licenseExpiry: d("2027-11-21") },
    { code: "DRV-003", name: "Yusuf Maulana", phone: "082112345678", licenseNumber: "921401220336", licenseType: "BII Umum", licenseExpiry: d("2027-05-09") },
  ]) drivers.push(await db.driver.upsert({ where: { code: row.code }, update: row, create: row }));

  const vehicles = [];
  const vehicleRows = [
    { code: "VEH-001", plateNumber: "B 9341 KDA", vehicleType: "Dump Truck", brand: "Hino", model: "Ranger FG", year: 2023, capacity: 30, ownership: "COMPANY", assignedDriverId: drivers[0].id, stnkExpiry: d("2027-02-10"), kirExpiry: d("2026-11-02"), insuranceExpiry: d("2027-01-15"), status: "AVAILABLE" },
    { code: "VEH-002", plateNumber: "B 9281 KDA", vehicleType: "Dump Truck", brand: "Mitsubishi", model: "Fuso FN", year: 2022, capacity: 25, ownership: "COMPANY", assignedDriverId: drivers[1].id, stnkExpiry: d("2027-04-17"), kirExpiry: d("2026-10-02"), insuranceExpiry: d("2027-03-20"), status: "IN_TRANSIT" },
    { code: "VEH-003", plateNumber: "F 8124 QZ", vehicleType: "Dump Truck", brand: "UD Trucks", model: "Quester", year: 2021, capacity: 28, ownership: "VENDOR", vendor: "PT Armada Lintas Jaya", assignedDriverId: drivers[2].id, stnkExpiry: d("2027-06-30"), kirExpiry: d("2027-01-18"), status: "MAINTENANCE" },
  ];
  for (const row of vehicleRows) vehicles.push(await db.vehicle.upsert({ where: { code: row.code }, update: row, create: row }));
  if (!await db.vehicleMaintenance.findFirst({ where: { vehicleId: vehicles[2].id, description: "Penggantian kampas rem belakang" } })) await db.vehicleMaintenance.create({ data: { vehicleId: vehicles[2].id, description: "Penggantian kampas rem belakang", status: "IN_PROGRESS", scheduledAt: d("2026-09-18"), startedAt: d("2026-09-18"), cost: 2800000 } });

  const rm = await db.stockpile.upsert({ where: { code: "RM-01" }, update: { materialId: boulder.id }, create: { code: "RM-01", name: "Raw Material Yard", type: StockpileType.RAW_MATERIAL, location: "Zona Utara", maximumCapacity: 5000, minimumStock: 800, materialId: boulder.id } });
  const fg = await db.stockpile.upsert({ where: { code: "FG-01" }, update: { productId: products[0].id }, create: { code: "FG-01", name: "Split 1/2 Stockpile", type: StockpileType.FINISHED_GOODS, location: "Zona Timur", maximumCapacity: 3500, minimumStock: 350, productId: products[0].id, status: StockpileStatus.ACTIVE } });
  const warehouse = await db.stockpile.upsert({ where: { code: "WH-SP" }, update: {}, create: { code: "WH-SP", name: "Gudang Spare Part", type: StockpileType.TEMPORARY, location: "Workshop", maximumCapacity: 10000, minimumStock: 0, unit: "PCS" } });

  const equipment = [];
  for (const row of [
    { code: "CR-001", name: "Jaw Crusher #01", category: "JAW_CRUSHER", brand: "Metso", model: "C120", serialNumber: "MTS-C120-2401", location: "Crusher Line A", hourMeter: 2240, maintenanceInterval: 250, lastMaintenanceHour: 2000, status: "MAINTENANCE_DUE" },
    { code: "CR-002", name: "Cone Crusher #01", category: "CONE_CRUSHER", brand: "Sandvik", model: "CH440", serialNumber: "SVK-CH440-118", location: "Crusher Line A", hourMeter: 1875, maintenanceInterval: 250, lastMaintenanceHour: 1750, status: "OPERATIONAL" },
    { code: "LD-001", name: "Wheel Loader #01", category: "WHEEL_LOADER", brand: "Caterpillar", model: "950 GC", serialNumber: "CAT950-9081", location: "Raw Material Yard", hourMeter: 3410, maintenanceInterval: 500, lastMaintenanceHour: 3000, status: "OPERATIONAL" },
  ]) equipment.push(await db.equipment.upsert({ where: { code: row.code }, update: row, create: { ...row, installationDate: d("2023-04-12") } }));

  const spareParts = [];
  for (const row of [
    { code: "SP-001", name: "Jaw Plate PE-600", category: "CRUSHER_COMPONENT", manufacturer: "Metso", partNumber: "JP-PE600", unit: "PCS", minimumStock: 2, unitCost: 7500000, supplierId: suppliers[0].id, storageLocation: "Rack A-02" },
    { code: "SP-002", name: "Bearing 22320", category: "BEARING", manufacturer: "SKF", partNumber: "SKF-22320", unit: "PCS", minimumStock: 4, unitCost: 750000, supplierId: suppliers[0].id, storageLocation: "Rack B-01" },
    { code: "SP-003", name: "V-Belt C-128", category: "POWER_TRANSMISSION", manufacturer: "Bando", partNumber: "VB-C128", unit: "PCS", minimumStock: 6, unitCost: 425000, supplierId: suppliers[0].id, storageLocation: "Rack B-04" },
  ]) spareParts.push(await db.sparePart.upsert({ where: { code: row.code }, update: row, create: row }));
  for (const [sparePartId, equipmentId] of [[spareParts[0].id, equipment[0].id], [spareParts[1].id, equipment[0].id], [spareParts[1].id, equipment[1].id], [spareParts[2].id, equipment[1].id]]) await db.sparePartEquipment.upsert({ where: { sparePartId_equipmentId: { sparePartId, equipmentId } }, update: {}, create: { sparePartId, equipmentId } });

  const so1 = await db.salesOrder.upsert({ where: { number: "SO-202609-0042" }, update: {}, create: { number: "SO-202609-0042", customerId: customers[0].id, orderDate: d("2026-09-15"), status: "PARTIALLY_DELIVERED", subtotal: 142500000, tax: 15675000, total: 158175000 } });
  const so2 = await db.salesOrder.upsert({ where: { number: "SO-202609-0043" }, update: {}, create: { number: "SO-202609-0043", customerId: customers[1].id, orderDate: d("2026-09-17"), status: "CONFIRMED", subtotal: 52250000, tax: 5747500, total: 57997500 } });
  if (!await db.salesOrderItem.findFirst({ where: { salesOrderId: so1.id, descriptionSnapshot: "Batu Split 1/2" } })) await db.salesOrderItem.create({ data: { salesOrderId: so1.id, productId: products[0].id, descriptionSnapshot: "Batu Split 1/2", quantity: 500, deliveredQuantity: 49, unitPrice: 285000 } });
  if (!await db.salesOrderItem.findFirst({ where: { salesOrderId: so2.id, descriptionSnapshot: "Base Course A" } })) await db.salesOrderItem.create({ data: { salesOrderId: so2.id, productId: products[4].id, descriptionSnapshot: "Base Course A", quantity: 250, unitPrice: 209000 } });
  await db.deliveryOrder.upsert({ where: { number: "DO-202609-0082" }, update: {}, create: { number: "DO-202609-0082", suratJalanNumber: "SJ-202609-0082", salesOrderId: so1.id, vehicleId: vehicles[1].id, driverId: drivers[1].id, destinationSnapshot: customers[0].address, plannedQuantity: 25, netWeight: 24.8, status: "IN_TRANSIT" } });
  await db.deliveryOrder.upsert({ where: { number: "DO-202609-0083" }, update: {}, create: { number: "DO-202609-0083", salesOrderId: so1.id, vehicleId: vehicles[0].id, driverId: drivers[0].id, destinationSnapshot: customers[0].address, plannedQuantity: 25, status: "SCHEDULED" } });

  const quotation = await db.quotation.upsert({ where: { number: "QUO-202609-0021" }, update: {}, create: { number: "QUO-202609-0021", customerId: customers[2].id, quotationDate: d("2026-09-15"), validUntil: d("2026-09-30"), status: "SENT", subtotal: 85500000, tax: 9405000, total: 94905000, notes: "Harga franco proyek Sentul." } });
  if (!await db.quotationItem.findFirst({ where: { quotationId: quotation.id } })) await db.quotationItem.createMany({ data: [{ quotationId: quotation.id, productId: products[0].id, descriptionSnapshot: "Batu Split 1/2", quantity: 200, unitPrice: 285000 }, { quotationId: quotation.id, productId: products[2].id, descriptionSnapshot: "Screening", quantity: 150, unitPrice: 190000 }] });

  const invoice = await db.invoice.upsert({ where: { number: "INV-202609-0082" }, update: {}, create: { number: "INV-202609-0082", customerId: customers[0].id, salesOrderId: so1.id, issueDate: d("2026-09-10"), dueDate: d("2026-09-25"), status: "PARTIALLY_PAID", subtotal: 62500000, tax: 6875000, total: 69375000 } });
  if (!await db.invoiceItem.findFirst({ where: { invoiceId: invoice.id } })) await db.invoiceItem.create({ data: { invoiceId: invoice.id, productId: products[0].id, description: "Batu Split 1/2 - pengiriman tahap 1", quantity: 250, unitPrice: 250000 } });
  await db.payment.upsert({ where: { number: "PAY-202609-0011" }, update: {}, create: { number: "PAY-202609-0011", invoiceId: invoice.id, paymentDate: d("2026-09-16"), amount: 35000000, method: "BANK_TRANSFER", reference: "BCA-TRX-160926-8812" } });

  const pr = await db.purchaseRequest.upsert({ where: { number: "PR-202609-0042" }, update: {}, create: { number: "PR-202609-0042", requestDate: d("2026-09-16"), department: "Maintenance", requesterId: users[2].id, requesterName: users[2].name, requiredDate: d("2026-09-22"), priority: "URGENT", status: "APPROVED", reason: "Persiapan preventive maintenance crusher line A", estimatedTotal: 18000000 } });
  let prItem = await db.purchaseRequestItem.findFirst({ where: { purchaseRequestId: pr.id, sparePartId: spareParts[0].id } });
  if (!prItem) prItem = await db.purchaseRequestItem.create({ data: { purchaseRequestId: pr.id, sparePartId: spareParts[0].id, description: spareParts[0].name, category: "SPARE_PART", quantity: 2, unit: "PCS", estimatedPrice: 7500000, reason: "Replacement jaw crusher line #01" } });
  if (!await db.purchaseRequestItem.findFirst({ where: { purchaseRequestId: pr.id, sparePartId: spareParts[1].id } })) await db.purchaseRequestItem.create({ data: { purchaseRequestId: pr.id, sparePartId: spareParts[1].id, description: spareParts[1].name, category: "SPARE_PART", quantity: 4, unit: "PCS", estimatedPrice: 750000, reason: "Preventive maintenance" } });
  const po = await db.purchaseOrder.upsert({ where: { number: "PO-202609-0028" }, update: {}, create: { number: "PO-202609-0028", purchaseRequestId: pr.id, supplierId: suppliers[0].id, orderDate: d("2026-09-17"), expectedDate: d("2026-09-22"), status: "PARTIALLY_RECEIVED", subtotal: 18000000, tax: 1980000, total: 19980000 } });
  let poItem = await db.purchaseOrderItem.findFirst({ where: { purchaseOrderId: po.id, sparePartId: spareParts[0].id } });
  if (!poItem) poItem = await db.purchaseOrderItem.create({ data: { purchaseOrderId: po.id, purchaseRequestItemId: prItem.id, sparePartId: spareParts[0].id, description: spareParts[0].name, category: "SPARE_PART", quantity: 2, receivedQuantity: 1, unit: "PCS", unitPrice: 7500000 } });
  const receiving = await db.receiving.upsert({ where: { number: "RCV-202609-0018" }, update: {}, create: { number: "RCV-202609-0018", purchaseOrderId: po.id, receivingDate: d("2026-09-18"), deliveryNote: "SJ-TCI-0918", receivedById: users[1].id, receivedByName: users[1].name, notes: "Penerimaan parsial, kondisi baik." } });
  if (!await db.receivingItem.findFirst({ where: { receivingId: receiving.id, purchaseOrderItemId: poItem.id } })) await db.receivingItem.create({ data: { receivingId: receiving.id, purchaseOrderItemId: poItem.id, stockpileId: warehouse.id, quantity: 1 } });

  const batch = await db.productionBatch.upsert({ where: { number: "PRD-202609-0018" }, update: {}, create: { number: "PRD-202609-0018", productionDate: d("2026-09-18"), shift: "SHIFT_1", crusherLine: "Crusher Line A", supervisorId: admin.id, startTime: d("2026-09-18"), endTime: new Date("2026-09-18T15:30:00+07:00"), operatingHours: 7.5, downtimeHours: 0.5, rejectWeight: 8, targetWeight: 650, status: DocumentStatus.COMPLETED } });
  if (!await db.productionInput.findFirst({ where: { batchId: batch.id, materialId: boulder.id } })) await db.productionInput.create({ data: { batchId: batch.id, materialId: boulder.id, quantity: 670 } });
  if (!await db.productionOutput.findFirst({ where: { batchId: batch.id, productId: products[0].id } })) await db.productionOutput.createMany({ data: [{ batchId: batch.id, productId: products[0].id, quantity: 285 }, { batchId: batch.id, productId: products[2].id, quantity: 185 }] });

  const inventoryRows = [
    { number: "INVTX-0001", stockpileId: rm.id, materialId: boulder.id, type: InventoryType.RECEIVING, direction: StockDirection.IN, quantity: 1200, unitCost: 95000, referenceType: "INITIAL_STOCK", referenceId: rm.id, balanceAfter: 1200, processingKey: "seed:rm:boulder" },
    { number: "INVTX-0002", stockpileId: fg.id, productId: products[0].id, type: InventoryType.PRODUCTION_OUTPUT, direction: StockDirection.IN, quantity: 285, unitCost: 160000, referenceType: "PRODUCTION", referenceId: batch.id, balanceAfter: 285, processingKey: "seed:fg:split12" },
    { number: "INVTX-0003", stockpileId: warehouse.id, sparePartId: spareParts[0].id, type: InventoryType.RECEIVING, direction: StockDirection.IN, quantity: 3, unitCost: 7500000, referenceType: "RECEIVING", referenceId: receiving.id, balanceAfter: 3, processingKey: "seed:sp:jawplate:in" },
  ];
  for (const row of inventoryRows) await db.inventoryTransaction.upsert({ where: { processingKey: row.processingKey }, update: {}, create: { ...row, createdBy: admin.id } });
  await db.stockOpname.upsert({ where: { number: "STP-202609-0001" }, update: {}, create: { number: "STP-202609-0001", stockpileId: fg.id, productId: products[0].id, systemStock: 285, physicalStock: 284.5, variance: -0.5, reason: "Selisih toleransi timbang dan debu", status: DocumentStatus.WAITING_APPROVAL, countedBy: users[3].id } });
  await db.weighbridgeTransaction.upsert({ where: { ticketNumber: "WB-202609-0182" }, update: {}, create: { ticketNumber: "WB-202609-0182", transactionType: "OUTBOUND", vehicleId: vehicles[1].id, driverId: drivers[1].id, partyType: "CUSTOMER", partyId: customers[0].id, itemType: "PRODUCT", itemId: products[0].id, grossWeight: 37.2, tareWeight: 12.4, netWeight: 24.8, status: DocumentStatus.APPROVED, approvedAt: d("2026-09-18"), createdBy: users[3].id } });

  const maintenance = await db.maintenance.upsert({ where: { number: "MNT-202609-0032" }, update: {}, create: { number: "MNT-202609-0032", equipmentId: equipment[0].id, type: "PREVENTIVE", priority: "HIGH", status: "IN_PROGRESS", problem: "Penggantian jaw plate pada interval 250 jam", technician: "Dedi Irawan", scheduledAt: d("2026-09-18"), startedAt: new Date("2026-09-18T13:00:00+07:00"), interruptionStartedAt: new Date("2026-09-18T13:00:00+07:00"), hourMeter: 2240, laborCost: 1200000, otherCost: 300000 } });
  for (const [description, sortOrder, completed] of [["Shutdown equipment dan lockout", 1, true], ["Safety inspection", 2, true], ["Lepas jaw plate lama", 3, true], ["Pasang jaw plate baru", 4, false], ["Alignment dan test operation", 5, false]] as const) if (!await db.maintenanceTask.findFirst({ where: { maintenanceId: maintenance.id, description } })) await db.maintenanceTask.create({ data: { maintenanceId: maintenance.id, description, sortOrder, completedAt: completed ? d("2026-09-18") : undefined, completedBy: completed ? users[2].name : undefined } });
  if (!await db.maintenanceSparePart.findFirst({ where: { maintenanceId: maintenance.id, sparePartId: spareParts[1].id } })) await db.maintenanceSparePart.create({ data: { maintenanceId: maintenance.id, sparePartId: spareParts[1].id, stockpileId: warehouse.id, quantity: 2, unitCost: 750000 } });
  await db.inventoryTransaction.upsert({ where: { processingKey: "seed:maintenance:bearing:out" }, update: {}, create: { number: "INVTX-0004", stockpileId: warehouse.id, sparePartId: spareParts[1].id, type: InventoryType.MAINTENANCE_USAGE, direction: StockDirection.OUT, quantity: 2, unitCost: 750000, referenceType: "MAINTENANCE", referenceId: maintenance.id, balanceAfter: 4, processingKey: "seed:maintenance:bearing:out", createdBy: users[2].id } });

  let approval = await db.approvalRequest.findFirst({ where: { module: "PURCHASE_REQUEST", recordId: pr.id } });
  if (!approval) approval = await db.approvalRequest.create({ data: { module: "PURCHASE_REQUEST", recordId: pr.id, status: DocumentStatus.APPROVED, currentStep: 1 } });
  if (!await db.approvalHistory.findFirst({ where: { requestId: approval.id, action: "APPROVE" } })) await db.approvalHistory.create({ data: { requestId: approval.id, approverId: admin.id, action: "APPROVE", notes: "Disetujui untuk jadwal preventive maintenance." } });

  for (const row of [
    { type: "LOW_STOCK", title: "Jaw Plate mencapai stok minimum", message: "Stok Jaw Plate PE-600 perlu segera dipesan kembali.", href: `/spare-parts/${spareParts[0].id}` },
    { type: "MAINTENANCE_DUE", title: "Jaw Crusher #01 maintenance due", message: "Maintenance jatuh tempo dalam 10 jam operasi.", href: `/equipment/${equipment[0].id}` },
    { type: "APPROVAL", title: "Purchase Request menunggu tindak lanjut", message: "PR-202609-0042 telah disetujui dan siap diproses.", href: `/purchase-requests/${pr.id}` },
  ]) if (!await db.notification.findFirst({ where: { userId: admin.id, title: row.title } })) await db.notification.create({ data: { userId: admin.id, ...row } });
  if (!await db.auditLog.findFirst({ where: { module: "SEED", recordId: admin.id } })) await db.auditLog.create({ data: { userId: admin.id, module: "SEED", action: "CREATE", recordId: admin.id, newValue: { description: "Data demo StoneCrusher terpasang" } } });

  for (const row of [{ documentType: "SO", prefix: "SO", lastNumber: 43 }, { documentType: "PO", prefix: "PO", lastNumber: 28 }, { documentType: "INV", prefix: "INV", lastNumber: 82 }, { documentType: "MNT", prefix: "MNT", lastNumber: 32 }]) await db.numberSequence.upsert({ where: { documentType_period: { documentType: row.documentType, period: "202609" } }, update: { lastNumber: row.lastNumber }, create: { ...row, period: "202609", padding: 4 } });
  const settings = [
    { key: "company.profile", section: "COMPANY", value: { companyName: "StoneCrusher Demo Operations", address: "Cileungsi, Kabupaten Bogor", phone: "021-87950010", email: "operations@quarryflow.co.id", taxId: "01.234.567.8-432.000" } },
    { key: "plant.operations", section: "PLANT", value: { plantName: "Plant Cileungsi", plantCode: "CLG", location: "Jawa Barat", timezone: "Asia/Jakarta", operatingStart: "07:00", operatingEnd: "17:00", defaultWeightUnit: "TON" } },
    { key: "inventory.policy", section: "INVENTORY", value: { negativeStockPolicy: "DENY", stockAdjustmentApproval: true, lowStockWarning: true, capacityWarningPercentage: 90 } },
    { key: "commercial.defaults", section: "COMMERCIAL", value: { defaultTax: 11, defaultPaymentTerms: 30, quotationValidity: 14, invoiceDueDays: 30 } },
    { key: "maintenance.warning", section: "MAINTENANCE", value: { warningHours: 25, warningDays: 7, criticalBreakdownAlert: true } },
  ];
  for (const row of settings) await db.systemSetting.upsert({ where: { key: row.key }, update: { section: row.section, value: row.value, updatedBy: admin.id }, create: { ...row, updatedBy: admin.id } });

  console.log("Seed complete: seluruh tabel terisi data demo yang saling terhubung.");
  console.log("Login admin: admin@quarryflow.co.id / QuarryFlow2026!");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
