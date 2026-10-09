import { Prisma, PrismaClient } from "@prisma/client";

type Delegate = { upsert(input: { where: { id: string }; update: object; create: object }): Promise<unknown> };

// Legacy examples are archives only, never a second source of official opening balances.
export async function seedArchives(db: PrismaClient, id: (key: string) => string, at: Date, makerId: string, managerId: string) {
  const models = Prisma.dmmf.datamodel.models;
  const seed = async (model: string, override: (i: number) => object) => {
    const metadata = models.find(m => m.name === model)!;
    const delegate = (db as unknown as Record<string, Delegate>)[model[0].toLowerCase() + model.slice(1)];
    for (let i = 0; i < 10; i++) {
      const data: Record<string, unknown> = { id: id(`archive:${model}:${i}`) };
      for (const field of metadata.fields) {
        if (field.kind === "object" || field.hasDefaultValue || field.isUpdatedAt || !field.isRequired || field.isId) continue;
        if (field.kind === "enum") data[field.name] = Prisma.dmmf.datamodel.enums.find(e => e.name === field.type)!.values[0].name;
        else data[field.name] = field.type === "DateTime" ? at : field.type === "Decimal" ? "10" : field.type === "Int" ? 10 : field.type === "Boolean" ? true : field.type === "Json" ? { dummy: true, archive: true } : `DUMMY-ARCHIVE-${model}-${i + 1}`;
      }
      for (const relation of metadata.fields.filter(f => f.kind === "object" && f.relationFromFields?.length)) {
        for (const key of relation.relationFromFields!) if (metadata.fields.find(f => f.name === key)?.isRequired) data[key] = id(`archive:${relation.type}:${i}`);
      }
      Object.assign(data, override(i));
      try { await delegate.upsert({ where: { id: data.id as string }, update: {}, create: data }); } catch (error) { console.error(`Archive failed: ${model} ${i}`); throw error; }
    }
  };
  const ref = (model: string, i: number) => id(`archive:${model}:${i}`);
  const expires = new Date(at.getTime() + 365 * 86400000);
  await seed("Product", i => ({ name: `DUMMY ${["Split SC", "Beton BP", "Aspal AMP", "Hasil Blending"][i % 4]} ${i + 1}`, unit: i === 2 ? "TON" : "M3", sellingPrice: "10000", minimumStock: "10" }));
  await seed("Material", i => ({ name: `DUMMY ${i === 9 ? "Solar" : "Bahan Quarry"} ${i + 1}`, unit: i === 9 ? "L" : "TON" }));
  await seed("Customer", i => ({ companyName: `DUMMY Customer ${i + 1}`, email: `customer${i + 1}@example.invalid`, address: `DUMMY Site ${i + 1}`, phone: `DUMMY-PHONE-${i + 1}`, creditLimit: "1000000", paymentTerms: 30, customerType: "CONTRACTOR" }));
  await seed("Supplier", i => ({ name: `DUMMY Supplier ${i + 1}`, category: "MATERIAL", phone: `DUMMY-PHONE-${i + 1}`, address: `DUMMY Warehouse ${i + 1}` }));
  await seed("Driver", i => ({ name: `DUMMY Driver ${i + 1}`, phone: `DUMMY-PHONE-${i + 1}`, licenseType: "DUMMY BII", licenseExpiry: expires }));
  await seed("Vehicle", i => ({ plateNumber: `DUMMY-PLATE-${i + 1}`, vehicleType: "DUMP_TRUCK", capacity: "10", ownership: "COMPANY", assignedDriverId: ref("Driver", i), stnkExpiry: expires, kirExpiry: expires, status: "AVAILABLE" }));
  await seed("VehicleMaintenance", () => ({ status: "SCHEDULED", description: "DUMMY archive scheduled inspection", cost: "0" }));
  await seed("Stockpile", i => ({ name: `DUMMY archive yard ${i + 1}`, materialId: ref("Material", i), maximumCapacity: "10000", notes: "DUMMY archive; not mapped to official ledger opening" }));
  await seed("Equipment", i => ({ name: `DUMMY Equipment ${i + 1}`, category: "CRUSHER", location: `DUMMY Workshop ${i + 1}`, serialNumber: `DUMMY-SERIAL-${i + 1}` }));
  await seed("SparePart", i => ({ name: `DUMMY Bearing ${i + 1}`, category: "BEARING", supplierId: ref("Supplier", i), storageLocation: `DUMMY Rack ${i + 1}`, unitCost: "10000" }));
  for (let i = 0; i < 10; i++) await db.sparePartEquipment.upsert({ where: { sparePartId_equipmentId: { sparePartId: ref("SparePart", i), equipmentId: ref("Equipment", i) } }, update: {}, create: { sparePartId: ref("SparePart", i), equipmentId: ref("Equipment", i) } });
  await seed("SalesOrder", () => ({ status: "DRAFT", subtotal: "100000", tax: "0", total: "100000" }));
  await seed("SalesOrderItem", i => ({ descriptionSnapshot: `DUMMY archive product ${i + 1}`, productId: ref("Product", i), quantity: "10", unitPrice: "10000", deliveredQuantity: "0" }));
  await seed("DeliveryOrder", () => ({ destinationSnapshot: "DUMMY archive destination", plannedQuantity: "10", status: "PLANNED" }));
  await seed("Quotation", () => ({ validUntil: expires, subtotal: "100000", total: "100000" }));
  await seed("QuotationItem", i => ({ descriptionSnapshot: `DUMMY archive quotation product ${i + 1}`, quantity: "10", unitPrice: "10000" }));
  await seed("Invoice", () => ({ dueDate: expires, subtotal: "100000", total: "100000" }));
  await seed("InvoiceItem", i => ({ productId: ref("Product", i), description: `DUMMY archive invoice item ${i + 1}`, quantity: "10", unitPrice: "10000" }));
  await seed("Payment", () => ({ amount: "10000", method: "DUMMY_TRANSFER" }));
  await seed("PurchaseRequest", () => ({ requesterId: makerId, requesterName: "DUMMY PC", reason: "DUMMY archive procurement; CR remains inactive" }));
  await seed("PurchaseRequestItem", i => ({ sparePartId: ref("SparePart", i), description: `DUMMY Bearing ${i + 1}`, quantity: "10", unit: "PCS", estimatedPrice: "10000" }));
  await seed("PurchaseOrder", i => ({ purchaseRequestId: ref("PurchaseRequest", i), subtotal: "100000", total: "100000" }));
  await seed("PurchaseOrderItem", i => ({ purchaseRequestItemId: ref("PurchaseRequestItem", i), sparePartId: ref("SparePart", i), quantity: "10", unit: "PCS", unitPrice: "10000" }));
  await seed("Receiving", () => ({ receivedById: makerId, receivedByName: "DUMMY PC" }));
  await seed("ReceivingItem", () => ({ quantity: "10" }));
  await seed("ProductionBatch", () => ({ shift: "DUMMY_DAY", crusherLine: "DUMMY_SC", supervisorId: makerId, operatingHours: "2", targetWeight: "10" }));
  await seed("ProductionInput", () => ({ quantity: "20" }));
  await seed("ProductionOutput", () => ({ quantity: "10" }));
  await seed("StockOpname", i => ({ materialId: ref("Material", i), systemStock: "10", physicalStock: "11", variance: "1", reason: "DUMMY archive draft count", countedBy: makerId }));
  await seed("WeighbridgeTransaction", i => ({ transactionType: "OUTBOUND", partyType: "CUSTOMER", partyId: ref("Customer", i), itemType: "PRODUCT", itemId: ref("Product", i), grossWeight: "15", tareWeight: "5", netWeight: "10", createdBy: makerId, notes: "DUMMY archive ticket; not an official dispatch" }));
  await seed("Maintenance", () => ({ type: "PREVENTIVE", status: "SCHEDULED", notes: "DUMMY archive; no automatic inventory usage" }));
  await seed("MaintenanceTask", () => ({ description: "DUMMY archive inspection checklist" }));
  await seed("MaintenanceSparePart", i => ({ stockpileId: ref("Stockpile", i), sparePartId: ref("SparePart", i), quantity: "1", unitCost: "10000" }));
  await seed("ApprovalRequest", i => ({ module: "DUMMY_ARCHIVE", recordId: ref("PurchaseRequest", i), status: "REJECTED" }));
  await seed("ApprovalHistory", () => ({ approverId: managerId, action: "REJECT", notes: "DUMMY archive example; CR not activated" }));
  await seed("Notification", i => ({ userId: makerId, type: "DUMMY_INFO", title: `DUMMY sample ${i + 1}`, message: "Development example; not company data", href: "/reports" }));
}
