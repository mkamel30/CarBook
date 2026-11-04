/**
 * Pure derived state for the workbench shell (A5): vehicle-selection identity
 * rule, initial-load branch, urgent-badge count, banner visibility, modal
 * odometer floors.
 */

/**
 * Re-read the list after a save: keep the SAME object when the selected vehicle
 * is still present and its odometer did not move, otherwise every save hands down
 * a new reference and the details effect loads twice.
 */
export function resolveNextVehicle(
  prev: any | null,
  list: any[]
): any | null | undefined {
  if (list.length === 0) return null;
  const next = !prev ? list[0] : list.find((v: any) => v.id === prev.id) || list[0];
  if (prev && next && prev.id === next.id && prev.currentOdometer === next.currentOdometer) {
    return prev;
  }
  return next;
}

export const BODY_MODES = ['skeleton', 'loadError', 'firstRun', 'tabs'] as const;
export type BodyMode = (typeof BODY_MODES)[number];

/**
 * Which panel the tab body shows. Order is load-bearing: a failed first fetch must
 * show the retry panel, never the first-run "add your car" state (it invites
 * duplicate vehicles), and the settings tab is reachable without a vehicle.
 */
export function selectBodyMode(input: {
  loading: boolean;
  initialLoadDone: boolean;
  initialLoadError: string | null;
  vehicleCount: number;
  hasSelectedVehicle: boolean;
  activeTab: string;
}): BodyMode {
  if (input.loading && !input.initialLoadDone) return 'skeleton';
  const settingsTab = input.activeTab === 'settings';
  if (input.initialLoadError && input.vehicleCount === 0 && !settingsTab) return 'loadError';
  if (!input.hasSelectedVehicle && !settingsTab) return 'firstRun';
  return 'tabs';
}

/** Urgent badge / banner source: the same two statuses the banner text uses. */
export function countUrgentSchedules(schedules: any[]): number {
  return schedules.filter((s) => s.status === 'overdue' || s.status === 'due_soon').length;
}

/** The banner never shows on the alerts tab itself (it would duplicate it). */
export function shouldShowUrgentBanner(input: {
  hasSelectedVehicle: boolean;
  urgentCount: number;
  activeTab: string;
}): boolean {
  return input.hasSelectedVehicle && input.urgentCount > 0 && input.activeTab !== 'alerts';
}

/**
 * Modal odometer floors: editing an existing log may keep its own (older) reading,
 * a new log must start at the vehicle's current odometer.
 */
export function minOdometerFor(editingId: string | null, vehicle: any | null): number {
  return editingId ? 0 : vehicle?.currentOdometer ?? 0;
}
