import { recordSchema } from "./schema";
// Inspection-only discriminator rejects medical payloads before writing device storage.
export const inspectionDraftSchema = recordSchema.options[2];
