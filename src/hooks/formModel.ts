import { deriveMaintenanceTotal } from '@/components/tabs/maintenanceTotals';

/**
 * Pure form / payload builders for the workbench modals (A5).
 *
 * Dates come in as arguments (`today`, `now`) instead of being read from the clock,
 * so the builders are deterministic under test; the page passes the same values the
 * inline code used to compute (`new Date().toISOString().split('T')[0]`).
 */

export interface VehicleForm {
  name: string;
  make: string;
  model: string;
  year: number;
  engineCc: string;
  licensePlate: string;
  initialOdometer: number;
  recommendedOil: string;
}

export interface FuelForm {
  fillDate: string;
  odometer: number;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  isFullTank: boolean;
  notes: string;
}

export interface MaintenanceForm {
  serviceDate: string;
  odometer: number;
  serviceType: string;
  title: string;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  workshop: string;
  notes: string;
  nextDueOdometer: number;
  nextDueDate: string;
}

export interface MaintenancePart {
  id: string;
  name: string;
  condition: 'new' | 'used_import';
  cost: number;
}

export type FuelTypeOption = { id: string; name: string; price: number };

// ---------------------------------------------------------------- vehicles

export function emptyVehicleForm(currentYear: number): VehicleForm {
  return {
    name: '',
    make: '',
    model: '',
    year: currentYear,
    engineCc: '',
    licensePlate: '',
    initialOdometer: 0,
    recommendedOil: '',
  };
}

export function vehicleFormFromVehicle(v: any): VehicleForm {
  return {
    name: v.name,
    make: v.make,
    model: v.model,
    year: Number(v.year),
    engineCc: v.engineCc || '',
    licensePlate: v.licensePlate || '',
    initialOdometer: Number(v.initialOdometer || 0),
    recommendedOil: v.recommendedOil || '',
  };
}

/**
 * The write body: a new car starts its odometer trail at `initialOdometer`, an edit
 * keeps the live reading of the selected vehicle (never the form's initial value).
 */
export function vehicleSaveBody(input: {
  form: VehicleForm;
  editingId: string | null;
  hasSelectedVehicle: boolean;
  currentOdometer: number;
}): Record<string, unknown> {
  const isEdit = Boolean(input.editingId);
  return {
    ...(isEdit ? { id: input.editingId } : {}),
    ...input.form,
    initialOdometer: Number(input.form.initialOdometer),
    currentOdometer: isEdit && input.hasSelectedVehicle ? input.currentOdometer : Number(input.form.initialOdometer),
    year: Number(input.form.year),
  };
}

// -------------------------------------------------------------------- fuel

/**
 * Prefill for a NEW fuel log. The last log of this vehicle wins over the first
 * preset: its notes are matched against the preset names, else its price is matched
 * within a cent (the notes field is what the app stores the fuel name in).
 */
export function newFuelLogPrefill(input: {
  fuelLogs: any[];
  fuelTypes: FuelTypeOption[] | undefined;
  currentOdometer: number | undefined;
  today: string;
}): { selectedFuelType: string; form: FuelForm } {
  const lastLog = input.fuelLogs.length > 0 ? input.fuelLogs[0] : null;
  let selectedFuel = input.fuelTypes?.[0];

  if (lastLog) {
    const match = input.fuelTypes?.find(
      (f) => f.name === lastLog.notes || Math.abs(f.price - lastLog.pricePerLiter) < 0.01
    );
    if (match) {
      selectedFuel = match;
    }
  }

  const fuelTypeId = selectedFuel ? selectedFuel.id : lastLog ? 'custom' : '';
  const price = lastLog ? lastLog.pricePerLiter : selectedFuel ? selectedFuel.price : 15;
  const fuelName = lastLog?.notes || selectedFuel?.name || '';

  return {
    selectedFuelType: fuelTypeId,
    form: {
      fillDate: input.today,
      odometer: input.currentOdometer || 0,
      liters: 0,
      pricePerLiter: price,
      totalCost: 0,
      isFullTank: true,
      notes: fuelName,
    },
  };
}

export function fuelTypeForEdit(log: any, fuelTypes: FuelTypeOption[] | undefined): string {
  const matchedType = fuelTypes?.find((f) => f.price === log.pricePerLiter || f.name === log.notes);
  return matchedType ? matchedType.id : 'custom';
}

export function fuelFormFromLog(log: any): FuelForm {
  return {
    fillDate: log.fillDate,
    odometer: log.odometer,
    liters: log.liters,
    pricePerLiter: log.pricePerLiter,
    totalCost: log.totalCost,
    isFullTank: log.isFullTank,
    notes: log.notes || '',
  };
}

export function fuelSavePayload(input: {
  form: FuelForm;
  editingId: string | null;
  vehicleId: string;
}): Record<string, unknown> {
  return {
    ...(input.editingId ? { id: input.editingId } : {}),
    ...input.form,
    vehicleId: input.vehicleId,
    odometer: Number(input.form.odometer),
    liters: Number(input.form.liters),
    pricePerLiter: Number(input.form.pricePerLiter),
    totalCost: Number(input.form.totalCost),
  };
}

// ------------------------------------------------------------- maintenance

export function emptyMaintenanceForm(input: { today: string; odometer: number | undefined }): MaintenanceForm {
  return {
    serviceDate: input.today,
    odometer: input.odometer || 0,
    serviceType: 'oil_change',
    title: '',
    partsCost: 0,
    laborCost: 0,
    totalCost: 0,
    workshop: '',
    notes: '',
    nextDueOdometer: 0,
    nextDueDate: '',
  };
}

/** Stored parts carry no client id; synthesise a stable one per row for the editor. */
export function partsListFromLog(log: any, now: number): MaintenancePart[] {
  const existingParts = log.partsList || [];
  return existingParts.map((p: any, idx: number) => ({
    id: p.id || `p_${now}_${idx}`,
    name: p.name,
    condition: p.condition || 'new',
    cost: Number(p.cost) || 0,
  }));
}

export function maintenanceFormFromLog(log: any): MaintenanceForm {
  return {
    serviceDate: log.serviceDate,
    odometer: log.odometer,
    serviceType: log.serviceType,
    title: log.title,
    partsCost: log.partsCost || 0,
    laborCost: log.laborCost || 0,
    totalCost: log.totalCost || 0,
    workshop: log.workshop || '',
    notes: log.notes || '',
    nextDueOdometer: log.nextDueOdometer || 0,
    nextDueDate: log.nextDueDate || '',
  };
}

/**
 * The write body. Additive, honest rule (see maintenanceTotals.ts): when parts or
 * labor are filled the grand total is their sum; when both are 0/empty we honor the
 * typed lump-sum total instead of silently overwriting it.
 */
export function maintenanceSavePayload(input: {
  form: MaintenanceForm;
  partsList: MaintenancePart[];
  editingId: string | null;
  vehicleId: string;
}): Record<string, unknown> {
  const totalPartsCost = input.partsList.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
  const labor = Number(input.form.laborCost) || 0;
  const { total: finalTotal } = deriveMaintenanceTotal(totalPartsCost, labor, input.form.totalCost);

  return {
    ...(input.editingId ? { id: input.editingId } : {}),
    ...input.form,
    vehicleId: input.vehicleId,
    odometer: Number(input.form.odometer),
    partsList: input.partsList.length > 0 ? input.partsList : null,
    partsCost: totalPartsCost,
    laborCost: labor,
    totalCost: finalTotal,
    nextDueOdometer: input.form.nextDueOdometer ? Number(input.form.nextDueOdometer) : undefined,
  };
}

export function settingsSaveBody(settings: any): Record<string, unknown> {
  return {
    provider: settings.provider,
    // An empty field means "leave the stored key alone", not "delete it" — and it
    // must never be sent as an empty string.
    apiKey: settings.apiKey || undefined,
    fuelTypes: settings.fuelTypes,
  };
}

export const DEFAULT_FUEL_TYPES: FuelTypeOption[] = [
  { id: 'gasoline_92', name: 'بنزين 92', price: 22.25 },
  { id: 'gasoline_95', name: 'بنزين 95', price: 24.0 },
  { id: 'gasoline_80', name: 'بنزين 80', price: 20.75 },
  { id: 'diesel', name: 'سولار', price: 20.5 },
  { id: 'cng', name: 'غاز طبيعي', price: 13.0 },
];
