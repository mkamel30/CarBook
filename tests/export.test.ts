import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildVehicleDossierWorkbook,
  buildMaintenanceWorkbook,
  buildFuelWorkbook,
  formatParts,
  autoFitColumns,
} from '../src/services/exportExcel';

describe('Excel Export Service', () => {
  const mockVehicle = {
    id: 'veh-123',
    name: 'السيارة العائلية',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    licensePlate: 'س ص ع 123',
    currentOdometer: 85000,
    recommendedOil: '5W-30 Full Synthetic',
    coolantSpec: 'Toyota Super Long Life Pink',
    transmissionSpec: 'Toyota ATF WS',
    tirePressureSpec: '32 PSI front / 32 PSI rear',
    fuelTankCapacity: 50,
    sparkPlugsSpec: 'Denso Iridium SC20HR11',
    batterySpec: '12V 45Ah DIN45',
  };

  const mockMaintenanceLogs = [
    {
      serviceDate: '2026-10-15',
      odometer: 80000,
      title: 'صيانة دورية وتغيير زيت',
      serviceType: 'oil_change',
      partsBreakdown: JSON.stringify([
        { name: 'فلتر زيت أصلي', condition: 'new', cost: 250 },
        { name: 'طقم بوجيهات', condition: 'used_import', cost: 600 },
      ]),
      partsCost: 850,
      laborCost: 200,
      totalCost: 1050,
      workshop: 'مركز تويوتا المعتمد',
      notes: 'تم فحص السيور والعفشة',
    },
  ];

  const mockFuelLogs = [
    {
      fillDate: '2026-10-20',
      odometer: 80600,
      distanceTraveled: 600,
      liters: 45,
      pricePerLiter: 15.25,
      totalCost: 686.25,
      calculatedLitersPer100Km: 7.5,
      costPerKm: 1.14,
      isFullTank: true,
      notes: 'طريق السفر',
    },
  ];

  it('formats parts breakdown correctly for Arabic and English', () => {
    const partsJson = mockMaintenanceLogs[0];
    const arFormatted = formatParts(partsJson, true);
    expect(arFormatted).toContain('فلتر زيت أصلي (جديد): 250');
    expect(arFormatted).toContain('طقم بوجيهات (استيراد): 600');

    const enFormatted = formatParts(partsJson, false);
    expect(enFormatted).toContain('فلتر زيت أصلي (New): 250');
    expect(enFormatted).toContain('طقم بوجيهات (Used/Import): 600');
  });

  it('calculates autoFitColumns properly', () => {
    const data = [{ colA: 'short', colB: 'a much longer text string for testing width' }];
    const widths = autoFitColumns(data);
    expect(widths.length).toBe(2);
    expect(widths[1].wch).toBeGreaterThan(widths[0].wch);
  });

  it('builds complete vehicle dossier with 3 sheets and formatted parts in Arabic', () => {
    const { wb, filename } = buildVehicleDossierWorkbook(mockVehicle, mockMaintenanceLogs, mockFuelLogs, 'ar');

    expect(filename).toContain('CarBook_');
    expect(filename).toContain('Dossier');
    expect(filename).toContain('.xlsx');

    // Check sheets
    expect(wb.SheetNames).toEqual(['سجل الصيانة', 'سجل الوقود', 'بيانات ومواصفات المركبة']);

    // Check maintenance sheet has parts breakdown string
    const maintSheet = wb.Sheets['سجل الصيانة'];
    const maintJson = XLSX.utils.sheet_to_json(maintSheet);
    expect(maintJson.length).toBe(1);
    expect((maintJson[0] as any)['تفاصيل قطع الغيار']).toContain('فلتر زيت أصلي (جديد): 250');
    expect((maintJson[0] as any)['تفاصيل قطع الغيار']).toContain('طقم بوجيهات (استيراد): 600');

    // Check fuel sheet
    const fuelSheet = wb.Sheets['سجل الوقود'];
    const fuelJson = XLSX.utils.sheet_to_json(fuelSheet);
    expect(fuelJson.length).toBe(1);
    expect((fuelJson[0] as any)['كمية الوقود (لتر)']).toBe(45);

    // Check vehicle specs sheet
    const vehicleSheet = wb.Sheets['بيانات ومواصفات المركبة'];
    const vehicleJson = XLSX.utils.sheet_to_json(vehicleSheet);
    expect(vehicleJson.length).toBeGreaterThanOrEqual(10);
  });

  it('builds English dossier with proper sheet names and column headers', () => {
    const { wb } = buildVehicleDossierWorkbook(mockVehicle, mockMaintenanceLogs, mockFuelLogs, 'en');

    expect(wb.SheetNames).toEqual(['Maintenance', 'Fuel Consumption', 'Vehicle Specs']);
    const maintSheet = wb.Sheets['Maintenance'];
    const maintJson = XLSX.utils.sheet_to_json(maintSheet);
    expect((maintJson[0] as any)['Parts Breakdown']).toContain('فلتر زيت أصلي (New): 250');
  });

  it('builds dedicated maintenance workbook', () => {
    const { wb, filename } = buildMaintenanceWorkbook(mockVehicle, mockMaintenanceLogs, 'ar');

    expect(filename).toContain('Maintenance');
    expect(wb.SheetNames).toEqual(['سجل الصيانة']);
  });

  it('builds dedicated fuel workbook', () => {
    const { wb, filename } = buildFuelWorkbook(mockVehicle, mockFuelLogs, 'ar');

    expect(filename).toContain('Fuel');
    expect(wb.SheetNames).toEqual(['سجل الوقود']);
  });
});
