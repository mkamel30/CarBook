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
  if (!record) return '-';
  const rawParts = record.partsList ?? record.parts_list ?? record.partsBreakdown;
  if (!rawParts) return '-';
  try {
    const parts: Array<{ name: string; condition?: string; cost?: number }> =
      typeof rawParts === 'string'
        ? JSON.parse(rawParts)
        : rawParts;
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
        const costStr = p.cost !== undefined && p.cost !== null ? `: ${p.cost}` : '';
        return `${p.name} (${cond})${costStr}`;
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
    [isAr ? 'التاريخ' : 'Date']: m.serviceDate || m.service_date || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: m.odometer ?? '-',
    [isAr ? 'الخدمة / البيان' : 'Service Title']: m.title || '-',
    [isAr ? 'التصنيف' : 'Category']: m.serviceType || m.service_type || '-',
    [isAr ? 'تفاصيل قطع الغيار' : 'Parts Breakdown']: formatParts(m, isAr),
    [isAr ? 'تكلفة قطع الغيار' : 'Parts Cost']: m.partsCost ?? m.parts_cost ?? 0,
    [isAr ? 'المصنعية' : 'Labor Cost']: m.laborCost ?? m.labor_cost ?? 0,
    [isAr ? 'الإجمالي' : 'Total Cost']: m.totalCost ?? m.total_cost ?? 0,
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
  const fuelData = (fuelLogs || []).map((f, idx) => {
    const distance = f.distanceTraveledKm ?? f.distanceTraveled ?? f.distance_traveled_km ?? f.distance_traveled ?? '-';
    const rawConsumption = f.litersPer100Km ?? f.calculatedLitersPer100Km ?? f.liters_per_100km;
    const consumption = rawConsumption !== undefined && rawConsumption !== null && !isNaN(Number(rawConsumption))
      ? Number(rawConsumption).toFixed(2)
      : '-';
    const rawCostPerKm = f.costPerKm ?? f.cost_per_km;
    const costPerKm = rawCostPerKm !== undefined && rawCostPerKm !== null && !isNaN(Number(rawCostPerKm))
      ? Number(rawCostPerKm).toFixed(2)
      : '-';
    const isFull = f.isFullTank === true || f.isFullTank === 1 || f.is_full_tank === 1;

    return {
      '#': idx + 1,
      [isAr ? 'التاريخ' : 'Date']: f.fillDate || f.fill_date || '-',
      [isAr ? 'العداد (كم)' : 'Odometer (km)']: f.odometer ?? '-',
      [isAr ? 'المسافة المقطوعة (كم)' : 'Distance (km)']: distance,
      [isAr ? 'كمية الوقود (لتر)' : 'Liters']: f.liters ?? 0,
      [isAr ? 'سعر اللتر' : 'Price / Liter']: f.pricePerLiter ?? f.price_per_liter ?? 0,
      [isAr ? 'التكلفة الإجمالية' : 'Total Cost']: f.totalCost ?? f.total_cost ?? 0,
      [isAr ? 'معدل الاستهلاك (لتر/100كم)' : 'Consumption (L/100km)']: consumption,
      [isAr ? 'التكلفة لكل كم' : 'Cost / km']: costPerKm,
      [isAr ? 'تفويلة كاملة' : 'Full Tank']: isFull ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No'),
      [isAr ? 'ملاحظات' : 'Notes']: f.notes || '-',
    };
  });

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
  let specs: any = {};
  if (vehicle?.specs) {
    try {
      specs = typeof vehicle.specs === 'string' ? JSON.parse(vehicle.specs) : vehicle.specs;
    } catch {
      specs = {};
    }
  }

  let tirePressure = vehicle?.tirePressureSpec || '-';
  if (specs?.tirePressurePsiFront || specs?.tirePressurePsiRear) {
    const front = specs.tirePressurePsiFront ? `${specs.tirePressurePsiFront} PSI` : '-';
    const rear = specs.tirePressurePsiRear ? `${specs.tirePressurePsiRear} PSI` : '-';
    tirePressure = isAr
      ? `أمام: ${front} | خلف: ${rear}`
      : `Front: ${front} | Rear: ${rear}`;
  }

  const fuelTankCap = specs?.fuelTankCapacityLiters
    ? `${specs.fuelTankCapacityLiters} L`
    : vehicle?.fuelTankCapacity
    ? `${vehicle.fuelTankCapacity} L`
    : '-';

  const engineOilCap = specs?.engineOilCapacityLiters
    ? `${specs.engineOilCapacityLiters} L`
    : '-';

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
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.licensePlate || vehicle?.license_plate || (isAr ? 'غير مسجلة' : 'Not registered'),
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'قراءة العداد الحالية' : 'Current Odometer (km)',
      [isAr ? 'المواصفة / القيمة' : 'Value']: vehicle?.currentOdometer ?? vehicle?.initialOdometer ?? 0,
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'لزوجة ومواصفة زيت المحرك' : 'Recommended Engine Oil',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.engineOilViscosity || vehicle?.recommendedOil || vehicle?.recommended_oil || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سعة زيت المحرك' : 'Engine Oil Capacity',
      [isAr ? 'المواصفة / القيمة' : 'Value']: engineOilCap,
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سائل التبريد (Coolant)' : 'Engine Coolant',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.coolantType || vehicle?.coolantSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'زيت ناقل الحركة (Transmission)' : 'Transmission Fluid',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.transmissionFluidType || vehicle?.transmissionSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سائل الفرامل (Brake Fluid)' : 'Brake Fluid',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.brakeFluidType || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'ضغط الإطارات الموصى به' : 'Tire Pressure',
      [isAr ? 'المواصفة / القيمة' : 'Value']: tirePressure,
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'سعة خزان الوقود' : 'Fuel Tank Capacity',
      [isAr ? 'المواصفة / القيمة' : 'Value']: fuelTankCap,
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'نوع الوقود / الأوكتان الموصى به' : 'Recommended Fuel Octane',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.recommendedFuelOctane || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'شمعات الاحتراق (بوجيهات)' : 'Spark Plugs',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.sparkPlugType || vehicle?.sparkPlugsSpec || '-',
    },
    {
      [isAr ? 'البند' : 'Parameter']: isAr ? 'مواصفة البطارية' : 'Battery Spec',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs?.batterySpec || vehicle?.batterySpec || '-',
    },
  ];

  if (specs?.generalNotesAr) {
    vehicleData.push({
      [isAr ? 'البند' : 'Parameter']: isAr ? 'ملاحظات وتوصيات المصنع' : 'OEM General Notes',
      [isAr ? 'المواصفة / القيمة' : 'Value']: specs.generalNotesAr,
    });
  }

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
    [isAr ? 'التاريخ' : 'Date']: m.serviceDate || m.service_date || '-',
    [isAr ? 'العداد (كم)' : 'Odometer (km)']: m.odometer ?? '-',
    [isAr ? 'الخدمة / البيان' : 'Service Title']: m.title || '-',
    [isAr ? 'التصنيف' : 'Category']: m.serviceType || m.service_type || '-',
    [isAr ? 'تفاصيل قطع الغيار' : 'Parts Breakdown']: formatParts(m, isAr),
    [isAr ? 'تكلفة قطع الغيار' : 'Parts Cost']: m.partsCost ?? m.parts_cost ?? 0,
    [isAr ? 'المصنعية' : 'Labor Cost']: m.laborCost ?? m.labor_cost ?? 0,
    [isAr ? 'الإجمالي' : 'Total Cost']: m.totalCost ?? m.total_cost ?? 0,
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

  const fuelData = (fuelLogs || []).map((f, idx) => {
    const distance = f.distanceTraveledKm ?? f.distanceTraveled ?? f.distance_traveled_km ?? f.distance_traveled ?? '-';
    const rawConsumption = f.litersPer100Km ?? f.calculatedLitersPer100Km ?? f.liters_per_100km;
    const consumption = rawConsumption !== undefined && rawConsumption !== null && !isNaN(Number(rawConsumption))
      ? Number(rawConsumption).toFixed(2)
      : '-';
    const rawCostPerKm = f.costPerKm ?? f.cost_per_km;
    const costPerKm = rawCostPerKm !== undefined && rawCostPerKm !== null && !isNaN(Number(rawCostPerKm))
      ? Number(rawCostPerKm).toFixed(2)
      : '-';
    const isFull = f.isFullTank === true || f.isFullTank === 1 || f.is_full_tank === 1;

    return {
      '#': idx + 1,
      [isAr ? 'التاريخ' : 'Date']: f.fillDate || f.fill_date || '-',
      [isAr ? 'العداد (كم)' : 'Odometer (km)']: f.odometer ?? '-',
      [isAr ? 'المسافة المقطوعة (كم)' : 'Distance (km)']: distance,
      [isAr ? 'كمية الوقود (لتر)' : 'Liters']: f.liters ?? 0,
      [isAr ? 'سعر اللتر' : 'Price / Liter']: f.pricePerLiter ?? f.price_per_liter ?? 0,
      [isAr ? 'التكلفة الإجمالية' : 'Total Cost']: f.totalCost ?? f.total_cost ?? 0,
      [isAr ? 'معدل الاستهلاك (لتر/100كم)' : 'Consumption (L/100km)']: consumption,
      [isAr ? 'التكلفة لكل كم' : 'Cost / km']: costPerKm,
      [isAr ? 'تفويلة كاملة' : 'Full Tank']: isFull ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No'),
      [isAr ? 'ملاحظات' : 'Notes']: f.notes || '-',
    };
  });

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
