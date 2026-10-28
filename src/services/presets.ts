export interface VehiclePresetItem {
  itemCode: string;
  titleAr: string;
  titleEn: string;
  intervalKm: number;
  intervalMonths?: number;
}

export const DEFAULT_MAINTENANCE_PRESETS: VehiclePresetItem[] = [
  {
    itemCode: 'engine_oil_filter',
    titleAr: 'تغيير زيت المحرك وفلتر الزيت',
    titleEn: 'Engine Oil & Filter Change',
    intervalKm: 10000,
    intervalMonths: 6,
  },
  {
    itemCode: 'air_filter',
    titleAr: 'تغيير فلتر الهواء',
    titleEn: 'Engine Air Filter Replacement',
    intervalKm: 20000,
    intervalMonths: 12,
  },
  {
    itemCode: 'cabin_ac_filter',
    titleAr: 'تغيير فلتر تكييف المقصورة',
    titleEn: 'Cabin AC Filter Replacement',
    intervalKm: 20000,
    intervalMonths: 12,
  },
  {
    itemCode: 'spark_plugs',
    titleAr: 'فحص وتغيير شمعات الاحتراق (البوجيهات)',
    titleEn: 'Spark Plugs Replacement',
    intervalKm: 40000,
    intervalMonths: 24,
  },
  {
    itemCode: 'brake_pads',
    titleAr: 'فحص وتغيير تيل الفرامل الأمامي والخلفي',
    titleEn: 'Brake Pads & Fluid Inspection',
    intervalKm: 30000,
    intervalMonths: 18,
  },
  {
    itemCode: 'transmission_oil',
    titleAr: 'تغيير زيت ناقل الحركة (الفتيس)',
    titleEn: 'Transmission Fluid (ATF/CVT) Replacement',
    intervalKm: 50000,
    intervalMonths: 36,
  },
  {
    itemCode: 'coolant',
    titleAr: 'تغيير سائل تبريد المحرك (مياه الردياتير)',
    titleEn: 'Engine Coolant Flush & Refill',
    intervalKm: 60000,
    intervalMonths: 36,
  },
  {
    itemCode: 'tires_rotation',
    titleAr: 'تبديل وترصيص الإطارات وضبط الزوايا',
    titleEn: 'Tire Rotation & Wheel Alignment',
    intervalKm: 10000,
    intervalMonths: 6,
  },
];
