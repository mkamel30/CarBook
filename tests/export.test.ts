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
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic',
      engineOilCapacityLiters: '4.2',
      coolantType: 'Toyota Super Long Life Pink',
      transmissionFluidType: 'Toyota ATF WS',
      brakeFluidType: 'DOT 4',
      tirePressurePsiFront: '32',
      tirePressurePsiRear: '30',
      fuelTankCapacityLiters: '50',
      recommendedFuelOctane: '92',
      sparkPlugType: 'Denso Iridium SC20HR11',
      batterySpec: '12V 45Ah DIN45',
      generalNotesAr: 'فحص دوري كل 10,000 كم',
    },
  };

  const mockMaintenanceLogs = [
    {
      serviceDate: '2026-10-15',
      odometer: 80000,
      title: 'صيانة دورية وتغيير زيت',
      serviceType: 'oil_change',
      partsList: [
        { name: 'فلتر زيت أصلي', condition: 'new', cost: 250 },
        { name: 'طقم بوجيهات', condition: 'used_import', cost: 600 },
      ],
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
      distanceTraveledKm: 600,
      liters: 45,
      pricePerLiter: 15.25,
      totalCost: 686.25,
      litersPer100Km: 7.5,
      costPerKm: 1.14,
      isFullTank: true,
      notes: 'طريق السفر',
    },
  ];

  it('formats parts breakdown correctly from partsList array for Arabic and English', () => {
    const partsRecord = mockMaintenanceLogs[0];
    const arFormatted = formatParts(partsRecord, true);
    expect(arFormatted).toContain('فلتر زيت أصلي (جديد): 250');
    expect(arFormatted).toContain('طقم بوجيهات (استيراد): 600');

    const enFormatted = formatParts(partsRecord, false);
    expect(enFormatted).toContain('فلتر زيت أصلي (New): 250');
    expect(enFormatted).toContain('طقم بوجيهات (Used/Import): 600');
  });

  it('formats parts breakdown correctly from legacy partsBreakdown or parts_list JSON strings', () => {
    const legacyRecord = {
      parts_list: JSON.stringify([{ name: 'سير كاتينة', condition: 'new', cost: 400 }]),
    };
    expect(formatParts(legacyRecord, true)).toContain('سير كاتينة (جديد): 400');
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

    // Check fuel sheet maps distanceTraveledKm, litersPer100Km, and costPerKm
    const fuelSheet = wb.Sheets['سجل الوقود'];
    const fuelJson = XLSX.utils.sheet_to_json(fuelSheet);
    expect(fuelJson.length).toBe(1);
    expect((fuelJson[0] as any)['كمية الوقود (لتر)']).toBe(45);
    expect((fuelJson[0] as any)['المسافة المقطوعة (كم)']).toBe(600);
    expect((fuelJson[0] as any)['معدل الاستهلاك (لتر/100كم)']).toBe('7.50');
    expect((fuelJson[0] as any)['التكلفة لكل كم']).toBe('1.14');
    expect((fuelJson[0] as any)['تفويلة كاملة']).toBe('نعم');

    // Check vehicle specs sheet parses specs JSON correctly
    const vehicleSheet = wb.Sheets['بيانات ومواصفات المركبة'];
    const vehicleJson: any[] = XLSX.utils.sheet_to_json(vehicleSheet);
    expect(vehicleJson.length).toBeGreaterThanOrEqual(12);

    const findVal = (paramName: string) =>
      vehicleJson.find((row) => row['البند'] === paramName)?.['المواصفة / القيمة'];

    expect(findVal('سائل التبريد (Coolant)')).toBe('Toyota Super Long Life Pink');
    expect(findVal('زيت ناقل الحركة (Transmission)')).toBe('Toyota ATF WS');
    expect(findVal('شمعات الاحتراق (بوجيهات)')).toBe('Denso Iridium SC20HR11');
    expect(findVal('سعة خزان الوقود')).toBe('50 L');
    expect(findVal('مواصفة البطارية')).toBe('12V 45Ah DIN45');
    expect(findVal('ضغط الإطارات الموصى به')).toContain('أمام: 32 PSI');
  });

  it('builds English dossier with proper sheet names and column headers', () => {
    const { wb } = buildVehicleDossierWorkbook(mockVehicle, mockMaintenanceLogs, mockFuelLogs, 'en');

    expect(wb.SheetNames).toEqual(['Maintenance', 'Fuel Consumption', 'Vehicle Specs']);
    const maintSheet = wb.Sheets['Maintenance'];
    const maintJson = XLSX.utils.sheet_to_json(maintSheet);
    expect((maintJson[0] as any)['Parts Breakdown']).toContain('فلتر زيت أصلي (New): 250');

    const fuelSheet = wb.Sheets['Fuel Consumption'];
    const fuelJson = XLSX.utils.sheet_to_json(fuelSheet);
    expect((fuelJson[0] as any)['Distance (km)']).toBe(600);
    expect((fuelJson[0] as any)['Consumption (L/100km)']).toBe('7.50');
    expect((fuelJson[0] as any)['Cost / km']).toBe('1.14');
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
    const fuelSheet = wb.Sheets['سجل الوقود'];
    const fuelJson = XLSX.utils.sheet_to_json(fuelSheet);
    expect((fuelJson[0] as any)['المسافة المقطوعة (كم)']).toBe(600);
    expect((fuelJson[0] as any)['معدل الاستهلاك (لتر/100كم)']).toBe('7.50');
  });
});

// A workshop note that happens to begin with =, + or - has to reach the sheet as
// data. In OOXML that is structural rather than defensive: text cells are written
// with no <f> element, so there is nothing for Excel to evaluate and therefore no
// reason to prefix the user's text with a quote and corrupt what they read back.
describe('Excel export cell typing', () => {
  const vehicle = {
    id: 'v1',
    name: '=HYPERLINK("http://evil","car")',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    currentOdometer: 100,
  };

  const maintenance = [{
    serviceDate: '2026-10-15',
    odometer: 100,
    title: '=cmd|/C calc!A0',
    serviceType: 'oil_change',
    partsList: [{ name: 'filter', condition: 'new', cost: 1 }],
    partsCost: 1,
    laborCost: 1,
    totalCost: 2,
    workshop: '+96500000000',
    notes: '- checked the belts first',
  }];

  const fuel = [{
    fillDate: '2026-10-20',
    odometer: 600,
    liters: 45,
    pricePerLiter: 15,
    totalCost: 675,
    isFullTank: true,
    notes: '@SUM(1,1)',
  }];

  function allCells(wb: XLSX.WorkBook) {
    const out: Array<{ sheet: string; addr: string; cell: XLSX.CellObject }> = [];
    for (const sheet of wb.SheetNames) {
      for (const addr of Object.keys(wb.Sheets[sheet])) {
        if (addr.startsWith('!')) continue;
        out.push({ sheet, addr, cell: wb.Sheets[sheet][addr] as XLSX.CellObject });
      }
    }
    return out;
  }

  it('emits no formula cell for any sheet', () => {
    const { wb } = buildVehicleDossierWorkbook(vehicle, maintenance, fuel, 'en');
    const cells = allCells(wb);
    expect(cells.length).toBeGreaterThan(20);
    for (const { sheet, addr, cell } of cells) {
      expect(cell.f, `${sheet}!${addr}`).toBeUndefined();
      expect(cell.t, `${sheet}!${addr}`).not.toBe('f');
    }
  });

  it('keeps leading-operator text exactly as the user wrote it', () => {
    const { wb } = buildVehicleDossierWorkbook(vehicle, maintenance, fuel, 'en');
    const values = allCells(wb).map((c) => c.cell.v);

    expect(values).toContain('- checked the belts first');
    expect(values).toContain('+96500000000');
    expect(values).toContain('=cmd|/C calc!A0');
    expect(values).toContain('@SUM(1,1)');
    expect(values).toContain('=HYPERLINK("http://evil","car")');
    expect(values.filter((v) => typeof v === 'string' && v.startsWith("'"))).toEqual([]);
  });
});
