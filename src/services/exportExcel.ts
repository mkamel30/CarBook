import * as XLSX from 'xlsx';

/**
 * Helper to compute column widths for auto-sizing Excel columns
 */
export function autoFitColumns(data: Record<string, any>[]): { wch: number }[] {
  if (!data || data.length === 0) return [];
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of data) {
      const val = row[key];
      if (val !== undefined && val !== null) {
        const len = String(val).length;
        if (len > maxLen) {
          maxLen = len;
        }
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 12), 60) };
  });
}

/**
 * Format parts breakdown into a clean readable string
 */
export function formatParts(record: any, isAr: boolean): string {
  if (!record.partsBreakdown) return '-';
  try {
    const parts: Array<{ name: string; condition?: string; cost: number }> =
      typeof record.partsBreakdown === 'string'
        ? JSON.parse(record.partsBreakdown)
        : record.partsBreakdown;
    if (!Array.isArray(parts) || parts.length === 0) return '-';
    return parts
      .map((p) => {
        const cond =
          p.condition === 'used_import'
            ? isAr
              ? 'استيراد'
              : 'Used/Import'
            : isAr
            ? 'جديد'
            : 'New';
        return `${p.name} (${cond}): ${p.cost}`;
      })
      .join(' | ');
  } catch {
    return '-';
  }
}

/**
 * Build the complete vehicle dossier workbook
 */
export function buildVehicleDossierWorkbook(
  vehicle: any,
  maintenanceLogs: any[],
  fuelLogs: any[],
  lang: string = 'ar'
): { wb: XLSX.WorkBook; filename: string } {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();

  // 1. Maintenance Sheet
  const maintData = (maintenanceLogs || []).map((m, idx) => ({
    '#': idx + 1,
    [isAr ? 'التاريخ' : 'Date']: m.serviceDate || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: m.odometer ?? '-',
    [isAr ? 'الخدمة / البيان' : 'Service Title']: m.title || '-',
    [isAr ? 'التصنيف' : 'Category']: m.serviceType || '-',
    [isAr ? 'تفاصيل قطع الغيار' : 'Parts Breakdown']: formatParts(m, isAr),
    [isAr ? 'تكلفة قطع الغيار' : 'Parts Cost']: m.partsCost ?? 0,
    [isAr ? 'المصنعية' : 'Labor Cost']: m.laborCost ?? 0,
    [isAr ? 'الإجمالي' : 'Total Cost']: m.totalCost ?? 0,
    [isAr ? 'الورشة / المركز' : 'Workshop']: m.workshop || '-',
    [isAr ? 'ملاحظات' : 'Notes']: m.notes || '-',
  }));

  const maintWs = XLSX.utils.json_to_sheet(
    maintData.length > 0
      ? maintData
      : [{ [isAr ? 'تنبيه' : 'Notice']: isAr ? 'لا توجد سجلات صيانة مسجلة' : 'No maintenance records logged' }]
  );
  if (maintData.length > 0) {
    maintWs['!cols'] = autoFitColumns(maintData);
  }
  XLSX.utils.book_append_sheet(wb, maintWs, isAr ? 'سجل الصيانة' : 'Maintenance');

  // 2. Fuel Sheet
  const fuelData = (fuelLogs || []).map((f, idx) => ({
    '#': idx + 1,
    [isAr ? 'التاريخ' : 'Date']: f.fillDate || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: f.odometer ?? '-',
    [isAr ? 'المسافة المقطوعة (كم)' : 'Distance (km)']: f.distanceTraveled ?? '-',
    [isAr ? 'كمية الوقود (لتر)' : 'Liters']: f.liters ?? 0,
    [isAr ? 'سعر اللتر' : 'Price / Liter']: f.pricePerLiter ?? 0,
    [isAr ? 'التكلفة الإجمالية' : 'Total Cost']: f.totalCost ?? 0,
    [isAr ? 'معدل الاستهلاك (لتر/100كم)' : 'Consumption (L/100km)']: f.calculatedLitersPer100Km
      ? Number(f.calculatedLitersPer100Km).toFixed(2)
      : '-',
    [isAr ? 'التكلفة لكل كم' : 'Cost / km']: f.costPerKm ? Number(f.costPerKm).toFixed(2) : '-',
    [isAr ? 'تفويلة كاملة' : 'Full Tank']: f.isFullTank
      ? isAr
        ? 'نعم'
        : 'Yes'
      : isAr
      ? 'لا'
      : 'No',
    [isAr ? 'ملاحظات' : 'Notes']: f.notes || '-',
  }));

  const fuelWs = XLSX.utils.json_to_sheet(
    fuelData.length > 0
      ? fuelData
      : [{ [isAr ? 'تنبيه' : 'Notice']: isAr ? 'لا توجد سجلات استهلاك وقود' : 'No fuel logs recorded' }]
  );
  if (fuelData.length > 0) {
    fuelWs['!cols'] = autoFitColumns(fuelData);
  }
  XLSX.utils.book_append_sheet(wb, fuelWs, isAr ? 'سجل الوقود' : 'Fuel Consumption');

  // 3. Vehicle & OEM Specs Sheet
  const vehicleData = [
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'اسم المركبة' : 'Vehicle Name',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.name || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'الشركة المصنعة (الصانع)' : 'Make',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.make || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'الموديل' : 'Model',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.model || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سنة الصنع' : 'Year',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.year || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'رقم اللوحة' : 'License Plate',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.licensePlate || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'قراءة العداد الحالية' : 'Current Odometer (km)',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.currentOdometer || vehicle?.initialOdometer || 0,
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'لزوجة ومواصفة زيت المحرك' : 'Recommended Engine Oil',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.recommendedOil || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سائل التبريد (Coolant)' : 'Engine Coolant',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.coolantSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'زيت ناقل الحركة (Transmission)' : 'Transmission Fluid',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.transmissionSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'ضغط الإطارات الموصى به' : 'Tire Pressure',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.tirePressureSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سعة خزان الوقود' : 'Fuel Tank Capacity',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.fuelTankCapacity ? `${vehicle.fuelTankCapacity} L` : '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'شمعات الاحتراق (بوجيهات)' : 'Spark Plugs',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.sparkPlugsSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'مواصفة البطارية' : 'Battery Spec',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.batterySpec || '-',
    },
  ];

  const vehicleWs = XLSX.utils.json_to_sheet(vehicleData);
  vehicleWs['!cols'] = autoFitColumns(vehicleData);
  XLSX.utils.book_append_sheet(wb, vehicleWs, isAr ? 'بيانات ومواصفات المركبة' : 'Vehicle Specs');

  const safeName = (vehicle?.name || 'Vehicle').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `CarBook_${safeName}_Dossier_${dateStr}.xlsx`;

  return { wb, filename };
}

/**
 * Build maintenance workbook
 */
export function buildMaintenanceWorkbook(
  vehicle: any,
  maintenanceLogs: any[],
  lang: string = 'ar'
): { wb: XLSX.WorkBook; filename: string } {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();

  const maintData = (maintenanceLogs || []).map((m, idx) => ({
    '#': idx + 1,
    [isAr ? 'التاريخ' : 'Date']: m.serviceDate || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: m.odometer ?? '-',
    [isAr ? 'الخدمة / البيان' : 'Service Title']: m.title || '-',
    [isAr ? 'التصنيف' : 'Category']: m.serviceType || '-',
    [isAr ? 'تفاصيل قطع الغيار' : 'Parts Breakdown']: formatParts(m, isAr),
    [isAr ? 'تكلفة قطع الغيار' : 'Parts Cost']: m.partsCost ?? 0,
    [isAr ? 'المصنعية' : 'Labor Cost']: m.laborCost ?? 0,
    [isAr ? 'الإجمالي' : 'Total Cost']: m.totalCost ?? 0,
    [isAr ? 'الورشة / المركز' : 'Workshop']: m.workshop || '-',
    [isAr ? 'ملاحظات' : 'Notes']: m.notes || '-',
  }));

  const maintWs = XLSX.utils.json_to_sheet(
    maintData.length > 0
      ? maintData
      : [{ [isAr ? 'تنبيه' : 'Notice']: isAr ? 'لا توجد سجلات صيانة مسجلة' : 'No maintenance records logged' }]
  );
  if (maintData.length > 0) {
    maintWs['!cols'] = autoFitColumns(maintData);
  }
  XLSX.utils.book_append_sheet(wb, maintWs, isAr ? 'سجل الصيانة' : 'Maintenance');

  const safeName = (vehicle?.name || 'Vehicle').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `CarBook_${safeName}_Maintenance_${dateStr}.xlsx`;

  return { wb, filename };
}

/**
 * Build fuel workbook
 */
export function buildFuelWorkbook(
  vehicle: any,
  fuelLogs: any[],
  lang: string = 'ar'
): { wb: XLSX.WorkBook; filename: string } {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();

  const fuelData = (fuelLogs || []).map((f, idx) => ({
    '#': idx + 1,
    [isAr ? 'التاريخ' : 'Date']: f.fillDate || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: f.odometer ?? '-',
    [isAr ? 'المسافة المقطوعة (كم)' : 'Distance (km)']: f.distanceTraveled ?? '-',
    [isAr ? 'كمية الوقود (لتر)' : 'Liters']: f.liters ?? 0,
    [isAr ? 'سعر اللتر' : 'Price / Liter']: f.pricePerLiter ?? 0,
    [isAr ? 'التكلفة الإجمالية' : 'Total Cost']: f.totalCost ?? 0,
    [isAr ? 'معدل الاستهلاك (لتر/100كم)' : 'Consumption (L/100km)']: f.calculatedLitersPer100Km
      ? Number(f.calculatedLitersPer100Km).toFixed(2)
      : '-',
    [isAr ? 'التكلفة لكل كم' : 'Cost / km']: f.costPerKm ? Number(f.costPerKm).toFixed(2) : '-',
    [isAr ? 'تفويلة كاملة' : 'Full Tank']: f.isFullTank
      ? isAr
        ? 'نعم'
        : 'Yes'
      : isAr
      ? 'لا'
      : 'No',
    [isAr ? 'ملاحظات' : 'Notes']: f.notes || '-',
  }));

  const fuelWs = XLSX.utils.json_to_sheet(
    fuelData.length > 0
      ? fuelData
      : [{ [isAr ? 'تنبيه' : 'Notice']: isAr ? 'لا توجد سجلات استهلاك وقود' : 'No fuel logs recorded' }]
  );
  if (fuelData.length > 0) {
    fuelWs['!cols'] = autoFitColumns(fuelData);
  }
  XLSX.utils.book_append_sheet(wb, fuelWs, isAr ? 'سجل الوقود' : 'Fuel Consumption');

  const safeName = (vehicle?.name || 'Vehicle').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `CarBook_${safeName}_Fuel_${dateStr}.xlsx`;

  return { wb, filename };
}

/**
 * Trigger browser file downloads
 */
export function exportVehicleDossierToExcel(
  vehicle: any,
  maintenanceLogs: any[],
  fuelLogs: any[],
  lang: string = 'ar'
) {
  const { wb, filename } = buildVehicleDossierWorkbook(vehicle, maintenanceLogs, fuelLogs, lang);
  XLSX.writeFile(wb, filename);
}

export function exportMaintenanceToExcel(
  vehicle: any,
  maintenanceLogs: any[],
  lang: string = 'ar'
) {
  const { wb, filename } = buildMaintenanceWorkbook(vehicle, maintenanceLogs, lang);
  XLSX.writeFile(wb, filename);
}

export function exportFuelToExcel(
  vehicle: any,
  fuelLogs: any[],
  lang: string = 'ar'
) {
  const { wb, filename } = buildFuelWorkbook(vehicle, fuelLogs, lang);
  XLSX.writeFile(wb, filename);
}
