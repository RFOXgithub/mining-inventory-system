import { z } from "zod";
export const customerSchema = z.object({
  code: z.string().trim().min(3).max(20).transform(x => x.toUpperCase()),
  companyName: z.string().trim().min(3).max(150), customerType: z.string().trim().min(2).max(50),
  pic: z.string().trim().min(2).max(100), phone: z.string().trim().min(7).max(30),
  email: z.string().email().optional().or(z.literal("")), address: z.string().trim().min(5).max(500),
  npwp: z.string().trim().max(40).optional().or(z.literal("")), creditLimit: z.number().nonnegative(),
  paymentTerms: z.number().int().min(0).max(365), active: z.boolean().default(true),
});

