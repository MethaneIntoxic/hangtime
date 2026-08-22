import { client } from "@/lib/db";
import { invalidatePlanDerivedStateInTransaction } from "@/lib/db/plan-mutations";

/**
 * Invalidate all derived recommendation and ballot state for a material plan
 * input change. Callers that mutate plan-scoped inputs should prefer the
 * in-transaction primitive so the input and invalidation commit together.
 */
export async function invalidatePlanDerivedState(input: {
  planId: string;
  actorId: string;
  reason: string;
}): Promise<boolean> {
  const tx = await client.transaction("write");
  try {
    const result = await invalidatePlanDerivedStateInTransaction(tx, input);
    if (!result) {
      await tx.rollback();
      return false;
    }
    await tx.commit();
    return true;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
