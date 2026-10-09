ALTER TABLE "User" ADD COLUMN "username" TEXT, ADD COLUMN "employeeCode" TEXT, ADD COLUMN "department" TEXT, ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE', ADD COLUMN "lastLoginAt" TIMESTAMP(3), ADD COLUMN "lockedUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
ALTER TABLE "Vehicle" ADD COLUMN "brand" TEXT, ADD COLUMN "model" TEXT, ADD COLUMN "year" INTEGER, ADD COLUMN "assignedDriverId" UUID, ADD COLUMN "insuranceExpiry" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_assignedDriverId_fkey" FOREIGN KEY("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "VehicleMaintenance" ("id" UUID PRIMARY KEY,"vehicleId" UUID NOT NULL,"description" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'SCHEDULED',"scheduledAt" TIMESTAMP(3) NOT NULL,"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),"cost" DECIMAL(18,2) NOT NULL DEFAULT 0,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE "VehicleMaintenance" ADD CONSTRAINT "VehicleMaintenance_vehicleId_fkey" FOREIGN KEY("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "VehicleMaintenance_vehicleId_status_scheduledAt_idx" ON "VehicleMaintenance"("vehicleId","status","scheduledAt");
CREATE TABLE "SystemSetting" ("id" UUID PRIMARY KEY,"key" TEXT NOT NULL,"section" TEXT NOT NULL,"value" JSONB NOT NULL,"updatedBy" UUID,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key"); CREATE INDEX "SystemSetting_section_idx" ON "SystemSetting"("section");
