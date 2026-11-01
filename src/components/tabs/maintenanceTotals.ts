/**
 * Pure grand-total derivation for the maintenance log form.
 *
 * Truthfulness rule: if the user filled parts and/or labor costs, the grand
 * total is the sum (derived, not editable). If both are 0/empty, whatever the
 * user typed as the total is honored (a single lump-sum invoice). Keeping the
 * logic here makes it unit-testable and shared between page.tsx (payload) and
 * MaintenanceLogModal (field state).
 */

export interface MaintenanceTotalResult {
  total: number;
  /** true when parts+labor drive the total, so the field is derived/read-only. */
  derived: boolean;
}

export function deriveMaintenanceTotal(
  partsCost: number | string,
  laborCost: number | string,
  typedTotal: number | string,
): MaintenanceTotalResult {
  const parts = Number(partsCost) || 0;
  const labor = Number(laborCost) || 0;
  if (parts > 0 || labor > 0) {
    return { total: parts + labor, derived: true };
  }
  return { total: Number(typedTotal) || 0, derived: false };
}
