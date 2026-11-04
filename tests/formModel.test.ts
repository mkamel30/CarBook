import { describe, it, expect } from 'vitest';
import {
  emptyVehicleForm,
  vehicleFormFromVehicle,
  vehicleSaveBody,
  newFuelLogPrefill,
  fuelTypeForEdit,
  fuelFormFromLog,
  fuelSavePayload,
  emptyMaintenanceForm,
  partsListFromLog,
  maintenanceFormFromLog,
  maintenanceSavePayload,
  settingsSaveBody,
  DEFAULT_FUEL_TYPES,
  type FuelTypeOption,
} from '@/hooks/formModel';

const FUEL_TYPES: FuelTypeOption[] = [
  { id: 'gasoline_92', name: 'بنزين 92', price: 22.25 },
  { id: 'gasoline_95', name: 'بنزين 95', price: 24.0 },
  { id: 'diesel', name: 'سولار', price: 20.5 },
];

describe('vehicle form builders', () => {
  it('emptyVehicleForm starts from the given year', () => {
    const f = emptyVehicleForm(2026);
    expect(f.year).toBe(2026);
    expect(f.name).toBe('');
    expect(f.initialOdometer).toBe(0);
  });

  it('vehicleFormFromVehicle fills defaults for missing optional fields', () => {
    const f = vehicleFormFromVehicle({
      name: 'Car', make: 'Toyota', model: 'Corolla', year: 2020,
      engineCc: null, licensePlate: null, initialOdometer: 0,
    });
    expect(f.engineCc).toBe('');
    expect(f.licensePlate).toBe('');
    expect(f.initialOdometer).toBe(0);
    expect(f.year).toBe(2020);
  });

  it('vehicleSaveBody: a new car starts its odometer trail at initialOdometer', () => {
    const body = vehicleSaveBody({
      form: emptyVehicleForm(2026), editingId: null,
      hasSelectedVehicle: true, currentOdometer: 999,
    });
    expect(body.id).toBeUndefined();
    expect(body.currentOdometer).toBe(0);
  });

  it('vehicleSaveBody: an edit keeps the live reading, never the form initial', () => {
    const form = { ...emptyVehicleForm(2026), initialOdometer: 5 };
    const body = vehicleSaveBody({
      form, editingId: 'v1', hasSelectedVehicle: true, currentOdometer: 12345,
    });
    expect(body.id).toBe('v1');
    expect(body.currentOdometer).toBe(12345);
  });
});

describe('fuel form builders', () => {
  it('newFuelLogPrefill with no logs uses the first preset', () => {
    const out = newFuelLogPrefill({
      fuelLogs: [], fuelTypes: FUEL_TYPES, currentOdometer: 5000, today: '2026-11-04',
    });
    expect(out.selectedFuelType).toBe('gasoline_92');
    expect(out.form.pricePerLiter).toBe(22.25);
    expect(out.form.notes).toBe('بنزين 92');
    expect(out.form.odometer).toBe(5000);
    expect(out.form.fillDate).toBe('2026-11-04');
  });

  it('newFuelLogPrefill matches the last log to a preset by name (notes)', () => {
    const out = newFuelLogPrefill({
      fuelLogs: [{ notes: 'سولار', pricePerLiter: 99 }], fuelTypes: FUEL_TYPES,
      currentOdometer: 5000, today: '2026-11-04',
    });
    expect(out.selectedFuelType).toBe('diesel');
    expect(out.form.pricePerLiter).toBe(99); // last log price wins
  });

  it('newFuelLogPrefill matches by price within a cent when notes do not match', () => {
    const out = newFuelLogPrefill({
      fuelLogs: [{ notes: 'custom name', pricePerLiter: 24.004 }], fuelTypes: FUEL_TYPES,
      currentOdometer: 5000, today: '2026-11-04',
    });
    expect(out.selectedFuelType).toBe('gasoline_95');
  });

  it('newFuelLogPrefill keeps the first preset when the last log matches nothing', () => {
    const out = newFuelLogPrefill({
      fuelLogs: [{ notes: 'jet fuel', pricePerLiter: 77 }], fuelTypes: FUEL_TYPES,
      currentOdometer: 0, today: '2026-11-04',
    });
    expect(out.selectedFuelType).toBe('gasoline_92');
    expect(out.form.pricePerLiter).toBe(77);
    expect(out.form.notes).toBe('jet fuel');
    expect(out.form.odometer).toBe(0);
  });

  it('newFuelLogPrefill uses custom only when there are no presets but a last log exists', () => {
    const out = newFuelLogPrefill({
      fuelLogs: [{ notes: 'x', pricePerLiter: 9 }], fuelTypes: undefined,
      currentOdometer: 0, today: '2026-11-04',
    });
    expect(out.selectedFuelType).toBe('custom');
  });

  it('fuelTypeForEdit matches by price or notes', () => {
    expect(fuelTypeForEdit({ pricePerLiter: 24.0, notes: '' }, FUEL_TYPES)).toBe('gasoline_95');
    expect(fuelTypeForEdit({ pricePerLiter: 0, notes: 'سولار' }, FUEL_TYPES)).toBe('diesel');
    expect(fuelTypeForEdit({ pricePerLiter: 1, notes: 'x' }, FUEL_TYPES)).toBe('custom');
  });

  it('fuelSavePayload coerces numbers and stamps the vehicle id', () => {
    const payload = fuelSavePayload({
      form: fuelFormFromLog({ fillDate: '2026-11-04', odometer: 10, liters: 20, pricePerLiter: 22, totalCost: 440, isFullTank: true, notes: '' }),
      editingId: 'f1', vehicleId: 'v1',
    });
    expect(payload.id).toBe('f1');
    expect(payload.vehicleId).toBe('v1');
    expect(payload.odometer).toBe(10);
    expect(payload.liters).toBe(20);
  });
});

describe('maintenance form builders', () => {
  it('emptyMaintenanceForm starts with oil_change and the vehicle odometer', () => {
    const f = emptyMaintenanceForm({ today: '2026-11-04', odometer: 9000 });
    expect(f.serviceType).toBe('oil_change');
    expect(f.odometer).toBe(9000);
    expect(f.serviceDate).toBe('2026-11-04');
  });

  it('partsListFromLog synthesises stable ids for stored parts', () => {
    const parts = partsListFromLog({ partsList: [{ name: 'Filter', condition: 'new', cost: 12 }] }, 1000);
    expect(parts[0].id).toBe('p_1000_0');
    expect(parts[0].cost).toBe(12);
  });

  it('maintenanceSavePayload sums parts+labor, overriding the typed lump-sum', () => {
    const form = emptyMaintenanceForm({ today: '2026-11-04', odometer: 100 });
    const payload = maintenanceSavePayload({
      form: { ...form, laborCost: 50, totalCost: 9999 },
      partsList: [{ id: 'p1', name: 'Filter', condition: 'new', cost: 40 }],
      editingId: 'm1', vehicleId: 'v1',
    });
    expect(payload.partsCost).toBe(40);
    expect(payload.laborCost).toBe(50);
    expect(payload.totalCost).toBe(90);
    expect(payload.nextDueOdometer).toBeUndefined();
  });

  it('maintenanceSavePayload honors the lump-sum when parts and labor are both zero', () => {
    const form = { ...emptyMaintenanceForm({ today: '2026-11-04', odometer: 100 }), totalCost: 555 };
    const payload = maintenanceSavePayload({
      form, partsList: [], editingId: null, vehicleId: 'v1',
    });
    expect(payload.partsCost).toBe(0);
    expect(payload.totalCost).toBe(555);
    expect(payload.partsList).toBeNull();
  });
});

describe('settings body', () => {
  it('settingsSaveBody drops an empty api key instead of sending ""', () => {
    const body = settingsSaveBody({ provider: 'gemini', apiKey: '', fuelTypes: FUEL_TYPES });
    expect(body.apiKey).toBeUndefined();
    expect(body.fuelTypes).toBe(FUEL_TYPES);
  });

  it('settingsSaveBody keeps a non-empty api key', () => {
    const body = settingsSaveBody({ provider: 'openrouter', apiKey: 'sk-123', fuelTypes: [] });
    expect(body.apiKey).toBe('sk-123');
  });
});

describe('DEFAULT_FUEL_TYPES', () => {
  it('has the five Egyptian presets in order', () => {
    expect(DEFAULT_FUEL_TYPES.map((f) => f.id)).toEqual([
      'gasoline_92', 'gasoline_95', 'gasoline_80', 'diesel', 'cng',
    ]);
  });
});
