// backend/src/modules/role-modules/schema.ts
import { z } from "zod";

export const putRoleModulesSchema = z.object({
  grants: z.record(z.string(), z.array(z.string()))
});

export type PutRoleModulesInput = z.infer<typeof putRoleModulesSchema>;
