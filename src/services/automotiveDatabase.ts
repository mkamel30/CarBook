import { VehicleManualSpecs, AILookupResponse } from './ai';
import {
  AiAnswerLang,
  DEFAULT_AI_LANG,
  DOCTOR_FRAMING,
  RULE_REPORT_HEADERS,
  ruleContentSide,
} from './aiLang';

export interface PreseededVehicleRecord {
  make: string;
  model: string;
  yearRange: [number, number];
  specs: VehicleManualSpecs;
  schedules: AILookupResponse;
}

export const PRESEEDED_VEHICLES: PreseededVehicleRecord[] = [
  {
    make: 'Toyota',
    model: 'Corolla',
    yearRange: [2014, 2026],
    specs: {
      engineOilViscosity: '0W-20 Full Synthetic (API SP / ILSAC GF-6) أو 5W-30',
      engineOilViscosityEn: '0W-20 Full Synthetic (API SP / ILSAC GF-6) or 5W-30',
      engineOilCapacityLiters: '4.2 لتر مع الفلتر (3.9 لتر بدون فلتر)',
      engineOilCapacityLitersEn: '4.2 L with filter (3.9 L without filter)',
      transmissionFluidType: 'Toyota Genuine CVT Fluid FE (أصلي مخصص للفتيس المستمر)',
      transmissionFluidTypeEn: 'Toyota Genuine CVT Fluid FE (factory fill for the CVT)',
      coolantType: 'Toyota Super Long Life Coolant (وردي مخفف 50/50 مسبقاً)',
      coolantTypeEn: 'Toyota Super Long Life Coolant (pink, pre-diluted 50/50)',
      brakeFluidType: 'DOT 4 أو DOT 5.1 عالي الأداء',
      brakeFluidTypeEn: 'DOT 4 or high-performance DOT 5.1',
      tirePressurePsiFront: '32 PSI (2.2 Bar)',
      tirePressurePsiRear: '32 PSI (2.2 Bar)',
      fuelTankCapacityLiters: '50 لتر',
      fuelTankCapacityLitersEn: '50 L',
      recommendedFuelOctane: 'بنزين 92 أو 95 خالٍ من الرصاص',
      recommendedFuelOctaneEn: 'Unleaded petrol 92 or 95',
      sparkPlugType: 'Denso SC20HR11 أو NGK ILKAR7B11 إيريديوم (0.8 مم)',
      sparkPlugTypeEn: 'Denso SC20HR11 or NGK ILKAR7B11 iridium (0.8 mm gap)',
      batterySpec: '12V 45Ah - 55Ah مع دعم الشحن الذكي',
      batterySpecEn: '12V 45Ah - 55Ah with smart-charge support',
      generalNotesAr: 'ينصح بالالتزام بزيت 0W-20 لتوفير الوقود وحماية نظام VVT-iW. لا تخلط زيت ناقل الحركة CVT بأي زيت هيدروليك عادي.',
      generalNotesEn: 'Stick to 0W-20 for fuel economy and VVT-iW protection. Never mix CVT fluid with any ordinary hydraulic fluid.',
    },
    schedules: {
      recommendedOil: '0W-20 Full Synthetic (API SP)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Engine Air Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف الكربوني', titleEn: 'Cabin AC Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'فحص وتغيير تيل الفرامل الأمامي', titleEn: 'Front Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير بوجيهات الإيريديوم الأصلية', titleEn: 'Iridium Spark Plugs', intervalKm: 80000, intervalMonths: 48 },
        { itemCode: 'cvt_fluid', titleAr: 'تغيير زيت ناقل الحركة CVT FE مع الفلتر', titleEn: 'CVT Transmission Fluid', intervalKm: 60000, intervalMonths: 36 },
        { itemCode: 'coolant', titleAr: 'استبدال سائل التبريد Super Long Life', titleEn: 'Engine Coolant Flush', intervalKm: 80000, intervalMonths: 48 },
      ],
      confidenceNotes: 'مواصفات المصنع الأصلية المعتمدة لسيارات تويوتا كورولا',
    },
  },
  {
    make: 'Hyundai',
    model: 'Elantra',
    yearRange: [2012, 2026],
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic (API SP / ACEA A5/B5)',
      engineOilCapacityLiters: '4.0 لتر مع الفلتر (3.6 لتر بدون فلتر)',
      engineOilCapacityLitersEn: '4.0 L with filter (3.6 L without filter)',
      transmissionFluidType: 'ATF SP-IV (أصلي لناقل الحركة الأوتوماتيكي 6 سرعات) أو IVT Fluid للموديلات الحديثة',
      transmissionFluidTypeEn: 'ATF SP-IV (genuine 6-speed automatic fluid) or IVT fluid on newer models',
      coolantType: 'Hyundai Long Life Coolant خافض حرارة عالي الجودة (أخضر أو وردي)',
      coolantTypeEn: 'Hyundai Long Life Coolant, premium antifreeze (green or pink)',
      brakeFluidType: 'DOT 4 معتمد',
      brakeFluidTypeEn: 'Approved DOT 4',
      tirePressurePsiFront: '33 PSI (2.3 Bar)',
      tirePressurePsiRear: '33 PSI (2.3 Bar)',
      fuelTankCapacityLiters: '50 لتر',
      fuelTankCapacityLitersEn: '50 L',
      recommendedFuelOctane: 'بنزين 92 خالٍ من الرصاص كحد أدنى',
      recommendedFuelOctaneEn: 'Unleaded petrol 92 minimum',
      sparkPlugType: 'NGK SILZKR6B10E أو Champion إيريديوم',
      sparkPlugTypeEn: 'NGK SILZKR6B10E or Champion iridium',
      batterySpec: '12V 60Ah - 70Ah DIN',
      generalNotesAr: 'محركات MPI و SmartStream حساسة جداً لدرجة لزوجة الزيت وسلامة فلتر الزيت الأصلي لسلامة الكامات وطلمبة الزيت.',
      generalNotesEn: 'MPI and SmartStream engines are very sensitive to oil viscosity and to using a genuine oil filter, which is what protects the cams and the oil pump.',
    },
    schedules: {
      recommendedOil: '5W-30 Full Synthetic (API SP)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء للمحرك', titleEn: 'Air Filter', intervalKm: 15000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'فحص أو استبدال تيل الفرامل', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'transmission_oil', titleAr: 'تغيير زيت ناقل الحركة الأوتوماتيكي ATF SP-IV', titleEn: 'Automatic Transmission Fluid', intervalKm: 50000, intervalMonths: 36 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق (بوجيهات)', titleEn: 'Spark Plugs', intervalKm: 60000, intervalMonths: 36 },
      ],
      confidenceNotes: 'مواصفات المصنع الأصلية المعتمدة لسيارات هيونداي إلنترا',
    },
  },
  {
    make: 'Nissan',
    model: 'Sunny',
    yearRange: [2013, 2026],
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic (API SN/SP) أو 10W-40',
      engineOilViscosityEn: '5W-30 Full Synthetic (API SN/SP) or 10W-40',
      engineOilCapacityLiters: '3.5 لتر مع الفلتر (3.2 لتر بدون فلتر)',
      engineOilCapacityLitersEn: '3.5 L with filter (3.2 L without filter)',
      transmissionFluidType: 'Nissan Genuine ATF Matic-D / Matic-S (ناقل حركة أوتوماتيك 4 سرعات)',
      transmissionFluidTypeEn: 'Nissan Genuine ATF Matic-D / Matic-S (4-speed automatic)',
      coolantType: 'Nissan Long Life Anti-Freeze Coolant (أزرق/أخضر)',
      coolantTypeEn: 'Nissan Long Life Anti-Freeze Coolant (blue/green)',
      brakeFluidType: 'DOT 4 أو DOT 3',
      brakeFluidTypeEn: 'DOT 4 or DOT 3',
      tirePressurePsiFront: '32 PSI (2.2 Bar)',
      tirePressurePsiRear: '30 PSI (2.1 Bar)',
      fuelTankCapacityLiters: '41 لتر',
      fuelTankCapacityLitersEn: '41 L',
      recommendedFuelOctane: 'بنزين 92 خالٍ من الرصاص',
      recommendedFuelOctaneEn: 'Unleaded petrol 92',
      sparkPlugType: 'NGK LZKAR6AP-11 أو Denso FXE20HR11',
      sparkPlugTypeEn: 'NGK LZKAR6AP-11 or Denso FXE20HR11',
      batterySpec: '12V 50Ah - 55Ah',
      generalNotesAr: 'ينصح بالالتزام بدورة التبريد الأصلية لنيسان صني N17 وتنظيف دورة الثروتل دورياً لضمان استقرار السلانسيه.',
      generalNotesEn: 'Keep the N17 Sunny on its factory cooling spec and clean the throttle body regularly so the idle stays stable.',
    },
    schedules: {
      recommendedOil: '5W-30 Full Synthetic',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Air Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'فحص وتغيير تيل الفرامل', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'atf_fluid', titleAr: 'تغيير زيت ناقل الحركة الأوتوماتيك Matic-S', titleEn: 'ATF Transmission Fluid', intervalKm: 40000, intervalMonths: 24 },
        { itemCode: 'fuel_filter', titleAr: 'تغيير فلتر البنزين', titleEn: 'Fuel Filter', intervalKm: 40000, intervalMonths: 24 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لنيسان صني',
    },
  },
  {
    make: 'Kia',
    model: 'Cerato',
    yearRange: [2010, 2026],
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic (API SP / ILSAC GF-6)',
      engineOilCapacityLiters: '3.8 لتر مع الفلتر',
      engineOilCapacityLitersEn: '3.8 L with filter',
      transmissionFluidType: 'ATF SP-IV أصلي',
      transmissionFluidTypeEn: 'Genuine ATF SP-IV',
      coolantType: 'Kia Genuine Coolant خافض حرارة وردي',
      coolantTypeEn: 'Kia Genuine Coolant, pink antifreeze',
      brakeFluidType: 'DOT 4',
      tirePressurePsiFront: '32 PSI',
      tirePressurePsiRear: '32 PSI',
      fuelTankCapacityLiters: '50 لتر',
      fuelTankCapacityLitersEn: '50 L',
      recommendedFuelOctane: 'بنزين 92 أو 95',
      recommendedFuelOctaneEn: 'Petrol 92 or 95',
      sparkPlugType: 'NGK Iridium SILZKR6B10E',
      batterySpec: '12V 60Ah DIN',
      generalNotesAr: 'محرك Gamma / SmartStream يحتاج زيت تخليقي بالكامل لتقليل صوت التاكيهات والحفاظ على البلوف الهيدروليكية.',
      generalNotesEn: 'The Gamma / SmartStream engine needs fully synthetic oil to quiet the lifters and keep the hydraulic lash adjusters working.',
    },
    schedules: {
      recommendedOil: '5W-30 Full Synthetic',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Air Filter', intervalKm: 15000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'تغيير تيل الفرامل الأمامي', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'atf_fluid', titleAr: 'تغيير زيت الفتيس الأوتوماتيك ATF SP-IV', titleEn: 'ATF Transmission Fluid', intervalKm: 50000, intervalMonths: 36 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق (بوجيهات)', titleEn: 'Spark Plugs', intervalKm: 60000, intervalMonths: 36 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لكيا سيراتو',
    },
  },
  {
    make: 'Fiat',
    model: 'Tipo',
    yearRange: [2016, 2026],
    specs: {
      engineOilViscosity: '5W-40 Synthetic معتمد (Selenia K Pure Energy / ACEA C3)',
      engineOilViscosityEn: '5W-40 approved synthetic (Selenia K Pure Energy / ACEA C3)',
      engineOilCapacityLiters: '2.95 لتر مع الفلتر لمحرك 1.4 أو 3.8 لتر لمحرك 1.6 E-TorQ',
      engineOilCapacityLitersEn: '2.95 L with filter for the 1.4, 3.8 L for the 1.6 E-TorQ',
      transmissionFluidType: 'Tutela Transmission GI/VI (ناقل حركة أوتوماتيك Aisin 6 سرعات)',
      transmissionFluidTypeEn: 'Tutela Transmission GI/VI (Aisin 6-speed automatic)',
      coolantType: 'Paraflu UP (أحمر عضوي OAT مخفف 50/50)',
      coolantTypeEn: 'Paraflu UP (red organic OAT, diluted 50/50)',
      brakeFluidType: 'Tutela Top 4 / DOT 4',
      tirePressurePsiFront: '32 PSI',
      tirePressurePsiRear: '30 PSI',
      fuelTankCapacityLiters: '45 لتر',
      fuelTankCapacityLitersEn: '45 L',
      recommendedFuelOctane: 'بنزين 92 أو 95',
      recommendedFuelOctaneEn: 'Petrol 92 or 95',
      sparkPlugType: 'NGK ZKR7A-10 أو إيريديوم',
      sparkPlugTypeEn: 'NGK ZKR7A-10 or iridium',
      batterySpec: '12V 50Ah - 60Ah Heavy Duty',
      generalNotesAr: 'محرك فيات تيبو يتطلب زيت متوافق بدقة مع معيار فيات 9.55535-S2 لمنع استهلاك الزيت والحفاظ على محول الحفاز.',
      generalNotesEn: 'The Fiat Tipo engine requires oil that precisely meets Fiat standard 9.55535-S2, otherwise it burns oil and damages the catalytic converter.',
    },
    schedules: {
      recommendedOil: '5W-40 Fully Synthetic (ACEA C3)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Air Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق (بوجيهات)', titleEn: 'Spark Plugs', intervalKm: 30000, intervalMonths: 24 },
        { itemCode: 'brake_pads', titleAr: 'فحص وتغيير تيل الفرامل', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'timing_belt', titleAr: 'فحص أو استبدال سير الكاتينة والمجموعة', titleEn: 'Timing Belt & Tensioners', intervalKm: 60000, intervalMonths: 48 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لفيات تيبو',
    },
  },
  {
    make: 'Renault',
    model: 'Megane',
    yearRange: [2016, 2026],
    specs: {
      engineOilViscosity: '5W-40 أو 5W-30 Full Synthetic (معيار Renault RN 0700 / RN 0710)',
      engineOilViscosityEn: '5W-40 or 5W-30 Full Synthetic (Renault RN 0700 / RN 0710)',
      engineOilCapacityLiters: '4.3 لتر مع الفلتر لمحرك 1.6 أو 4.8 لتر لمحرك 1.2/1.3 TCe',
      engineOilCapacityLitersEn: '4.3 L with filter for the 1.6, 4.8 L for the 1.2/1.3 TCe',
      transmissionFluidType: 'Renault Elfmatic CVT للموديلات المزودة بـ CVT أو Castrol BOT 450 لـ EDC دوال كلاتش',
      transmissionFluidTypeEn: 'Renault Elfmatic CVT for CVT models, Castrol BOT 450 for the dual-clutch EDC',
      coolantType: 'Glaceol RX Type D (أصفر/أخضر خاص برينو)',
      coolantTypeEn: 'Glaceol RX Type D (Renault-specific yellow/green)',
      brakeFluidType: 'DOT 4 ISO 4925 Class 6 (منخفض اللزوجة لـ ESP)',
      brakeFluidTypeEn: 'DOT 4 ISO 4925 Class 6 (low viscosity for ESP)',
      tirePressurePsiFront: '34 PSI (2.3 Bar)',
      tirePressurePsiRear: '31 PSI (2.1 Bar)',
      fuelTankCapacityLiters: '47 لتر أو 50 لتر',
      fuelTankCapacityLitersEn: '47 L or 50 L',
      recommendedFuelOctane: 'بنزين 95 خالٍ من الرصاص لمحركات TCe وبنزين 92 لمحركات التنفس الطبيعي',
      recommendedFuelOctaneEn: '95 unleaded for TCe engines, 92 for naturally aspirated ones',
      sparkPlugType: 'NGK ILKAR7J7G إيريديوم أصلي',
      sparkPlugTypeEn: 'NGK ILKAR7J7G genuine iridium',
      batterySpec: '12V 70Ah EFB/AGM لدعم نظام Start/Stop',
      batterySpecEn: '12V 70Ah EFB/AGM to support the Start/Stop system',
      generalNotesAr: 'محركات التوربو TCe تتطلب زيت متطابق حصرياً مع معيار RN17 وبنزين 95 لتفادي ظاهرة الإشعال المسبق (LSPI).',
      generalNotesEn: 'Turbo TCe engines require oil that strictly meets RN17 plus 95-octane fuel to avoid low-speed pre-ignition (LSPI).',
    },
    schedules: {
      recommendedOil: '5W-40 Full Synthetic (RN 0710/RN17)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Air Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق (بوجيهات)', titleEn: 'Spark Plugs', intervalKm: 40000, intervalMonths: 24 },
        { itemCode: 'brake_pads', titleAr: 'فحص وتغيير تيل الفرامل', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'trans_fluid', titleAr: 'تغيير زيت ناقل الحركة والفحص الهيدروليكي', titleEn: 'Transmission Service', intervalKm: 60000, intervalMonths: 36 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لرينو ميجان',
    },
  },
  {
    make: 'Kia',
    model: 'Sportage',
    yearRange: [2016, 2026],
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic (API SP / ACEA A5 أو C3 لمحركات T-GDI)',
      engineOilViscosityEn: '5W-30 Full Synthetic (API SP / ACEA A5, or C3 for T-GDI engines)',
      engineOilCapacityLiters: '4.0 لتر لمحرك 1.6 MPI أو 4.5 لتر لمحرك 1.6 T-GDI Turbo',
      engineOilCapacityLitersEn: '4.0 L for the 1.6 MPI, 4.5 L for the 1.6 T-GDI turbo',
      transmissionFluidType: 'ATF SP-IV (أوتوماتيك 6 سرعات) أو DCT Fluid 70W (دوال كلاتش 7 سرعات)',
      transmissionFluidTypeEn: 'ATF SP-IV (6-speed automatic) or 70W DCT fluid (7-speed dual clutch)',
      coolantType: 'Kia Long Life Coolant خافض حرارة وردي عالي الجودة',
      coolantTypeEn: 'Kia Long Life Coolant, premium pink antifreeze',
      brakeFluidType: 'DOT 4 معتمد',
      brakeFluidTypeEn: 'Approved DOT 4',
      tirePressurePsiFront: '35 PSI (2.4 Bar)',
      tirePressurePsiRear: '35 PSI (2.4 Bar)',
      fuelTankCapacityLiters: '62 لتر',
      fuelTankCapacityLitersEn: '62 L',
      recommendedFuelOctane: 'بنزين 92 كحد أدنى أو 95 لمحركات Turbo',
      recommendedFuelOctaneEn: 'Petrol 92 minimum, 95 for turbo engines',
      sparkPlugType: 'NGK SILZKR7E11 إيريديوم عالي الكفاءة',
      sparkPlugTypeEn: 'NGK SILZKR7E11 high-performance iridium',
      batterySpec: '12V 70Ah AGM/DIN',
      generalNotesAr: 'ينصح بالالتزام بتغيير زيت الفتيس في الموعد المحدد وفحص دورة التبريد بشكل منتظم لحماية محركات الـ GDI.',
      generalNotesEn: 'Change the transmission fluid on schedule and inspect the cooling system regularly to protect the GDI engine.',
    },
    schedules: {
      recommendedOil: '5W-30 Full Synthetic (API SP)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء للمحرك', titleEn: 'Air Filter', intervalKm: 15000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'فحص أو استبدال تيل الفرامل', titleEn: 'Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'trans_fluid', titleAr: 'تغيير زيت ناقل الحركة (ATF أو DCT)', titleEn: 'Transmission Fluid', intervalKm: 50000, intervalMonths: 36 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق الإيريديوم', titleEn: 'Iridium Spark Plugs', intervalKm: 60000, intervalMonths: 36 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لكيا سبورتاج',
    },
  },
  {
    make: 'Hyundai',
    model: 'Tucson',
    yearRange: [2016, 2026],
    specs: {
      engineOilViscosity: '5W-30 Full Synthetic (API SP / ILSAC GF-6) أو 0W-20 للموديلات الحديثة',
      engineOilViscosityEn: '5W-30 Full Synthetic (API SP / ILSAC GF-6), or 0W-20 on newer models',
      engineOilCapacityLiters: '4.2 لتر لمحرك 1.6 MPI أو 4.5 لتر لمحرك Turbo T-GDI',
      engineOilCapacityLitersEn: '4.2 L for the 1.6 MPI, 4.5 L for the turbo T-GDI',
      transmissionFluidType: 'Hyundai ATF SP-IV أو 7-Speed DCT Fluid',
      transmissionFluidTypeEn: 'Hyundai ATF SP-IV or 7-speed DCT fluid',
      coolantType: 'Hyundai Super Long Life Coolant وردي مخفف',
      coolantTypeEn: 'Hyundai Super Long Life Coolant, pink, diluted',
      brakeFluidType: 'DOT 4 عالي الأداء',
      brakeFluidTypeEn: 'High-performance DOT 4',
      tirePressurePsiFront: '35 PSI (2.4 Bar)',
      tirePressurePsiRear: '35 PSI (2.4 Bar)',
      fuelTankCapacityLiters: '62 لتر أو 54 لتر للموديلات الأحدث',
      fuelTankCapacityLitersEn: '62 L, or 54 L on newer models',
      recommendedFuelOctane: 'بنزين 92 كحد أدنى أو بنزين 95 لمحركات Turbo',
      recommendedFuelOctaneEn: 'Petrol 92 minimum, 95 for turbo engines',
      sparkPlugType: 'NGK SILZKR7E11 إيريديوم أصلي',
      sparkPlugTypeEn: 'NGK SILZKR7E11 genuine iridium',
      batterySpec: '12V 70Ah EFB/AGM',
      generalNotesAr: 'ينصح بالالتزام بزيوت API SP لمنع ظاهرة الإشعال المسبق للخليط (LSPI) في محركات التوربو والحقن المباشر.',
      generalNotesEn: 'Use API SP rated oil to prevent low-speed pre-ignition (LSPI) in turbocharged direct-injection engines.',
    },
    schedules: {
      recommendedOil: '5W-30 Full Synthetic (API SP)',
      maintenanceItems: [
        { itemCode: 'engine_oil', titleAr: 'تغيير زيت المحرك والفلتر الأصلي', titleEn: 'Engine Oil & Filter', intervalKm: 10000, intervalMonths: 6 },
        { itemCode: 'air_filter', titleAr: 'تغيير فلتر الهواء', titleEn: 'Air Filter', intervalKm: 15000, intervalMonths: 12 },
        { itemCode: 'cabin_filter', titleAr: 'تغيير فلتر التكييف', titleEn: 'Cabin Filter', intervalKm: 20000, intervalMonths: 12 },
        { itemCode: 'brake_pads', titleAr: 'تغيير تيل الفرامل الأمامي', titleEn: 'Front Brake Pads', intervalKm: 30000, intervalMonths: 18 },
        { itemCode: 'trans_fluid', titleAr: 'تغيير زيت ناقل الحركة والفحص', titleEn: 'Transmission Fluid', intervalKm: 50000, intervalMonths: 36 },
        { itemCode: 'spark_plugs', titleAr: 'تغيير شمعات الاحتراق الإيريديوم', titleEn: 'Spark Plugs', intervalKm: 60000, intervalMonths: 36 },
      ],
      confidenceNotes: 'مواصفات الصيانة الدورية المعتمدة لهيونداي توسان',
    },
  },
];

/**
 * Find pre-seeded vehicle specifications if available
 */
export function findPreseededVehicle(make: string, model: string, year: number): PreseededVehicleRecord | null {
  const mNorm = normalize(make);
  const modNorm = normalize(model);
  if (!mNorm || !modNorm) return null;

  for (const item of PRESEEDED_VEHICLES) {
    // Exact match only: a substring test hands "Corolla Cross" the plain
    // Corolla's oil capacity, and an empty model matches every record.
    if (
      normalize(item.make) === mNorm &&
      normalize(item.model) === modNorm &&
      year >= item.yearRange[0] &&
      year <= item.yearRange[1]
    ) {
      return item;
    }
  }
  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Intelligent Automotive Heuristic Fallback:
 * If a car is not in preseeded records and external AI fails or has no key,
 * this generates accurate, safe, conservative engineering specifications.
 */
export function generateHeuristicSpecs(make: string, model: string, year: number): VehicleManualSpecs {
  const isRecent = year >= 2018;
  const isOlder = year < 2010;

  const viscosity = isRecent
    ? '0W-20 أو 5W-30 Full Synthetic (API SP / ILSAC GF-6)'
    : isOlder
    ? '10W-40 أو 5W-40 Synthetic Blend / Full Synthetic (API SN)'
    : '5W-30 Full Synthetic (API SN/SP)';

  return {
    engineOilViscosity: viscosity,
    engineOilViscosityEn: isRecent
      ? '0W-20 or 5W-30 Full Synthetic (API SP / ILSAC GF-6)'
      : isOlder
      ? '10W-40 or 5W-40 Synthetic Blend / Full Synthetic (API SN)'
      : '5W-30 Full Synthetic (API SN/SP)',
    engineOilCapacityLiters: '4.0 لتر تقريباً مع الفلتر (راجع مقاس الزيت بدقة)',
    engineOilCapacityLitersEn: 'About 4.0 L with filter (verify the exact sump capacity)',
    transmissionFluidType: 'زيت ناقل حركة معتمد من الصانع (ATF / CVT / MTF)',
    transmissionFluidTypeEn: 'Manufacturer-approved transmission fluid (ATF / CVT / MTF)',
    coolantType: 'سائل تبريد أصلي عضوي خافض للحرارة (OAT Long Life Coolant)',
    coolantTypeEn: 'Genuine organic antifreeze (OAT Long Life Coolant)',
    brakeFluidType: 'DOT 4 معتمد ومقاوم للغليان',
    brakeFluidTypeEn: 'Approved DOT 4 with a high boiling point',
    tirePressurePsiFront: '32 PSI (2.2 Bar)',
    tirePressurePsiRear: '32 PSI (2.2 Bar)',
    fuelTankCapacityLiters: '50 لتر تقريباً',
    fuelTankCapacityLitersEn: 'About 50 L',
    recommendedFuelOctane: isRecent ? 'بنزين 92 أو 95 خالٍ من الرصاص' : 'بنزين 92 خالٍ من الرصاص',
    recommendedFuelOctaneEn: isRecent ? 'Unleaded petrol 92 or 95' : 'Unleaded petrol 92',
    sparkPlugType: isRecent ? 'إيريديوم عالي الكفاءة بفاصل 0.8 - 1.0 مم' : 'بلاتينيوم أو نيكل أصلي',
    sparkPlugTypeEn: isRecent ? 'High-grade iridium, 0.8 - 1.0 mm gap' : 'Genuine platinum or nickel',
    batterySpec: isRecent ? '12V 60Ah - 70Ah EFB/AGM' : '12V 55Ah - 60Ah',
    generalNotesAr: `المواصفات القياسية التقديرية الموصى بها هندسياً لسيارة ${make} ${model} موديل ${year}. يرجى مراجعة مؤشرات لوحة القيادة ومقاس الزيت بانتظام.`,
    generalNotesEn: `Engineering-recommended typical specifications for the ${make} ${model} (${year}). Verify the dashboard warnings and the actual oil capacity regularly.`,
  };
}

export function generateHeuristicSchedules(make: string, model: string, year: number): AILookupResponse {
  const isRecent = year >= 2018;
  const oil = isRecent ? '0W-20 أو 5W-30 Full Synthetic (API SP)' : '5W-30 Full Synthetic (API SN/SP)';

  return {
    recommendedOil: oil,
    maintenanceItems: [
      {
        itemCode: 'engine_oil',
        titleAr: 'تغيير زيت المحرك والفلتر',
        titleEn: 'Engine Oil & Filter',
        intervalKm: 10000,
        intervalMonths: 6,
      },
      {
        itemCode: 'air_filter',
        titleAr: 'تغيير فلتر الهواء للمحرك',
        titleEn: 'Air Filter',
        intervalKm: 20000,
        intervalMonths: 12,
      },
      {
        itemCode: 'cabin_filter',
        titleAr: 'تغيير فلتر تكييف الهواء',
        titleEn: 'Cabin AC Filter',
        intervalKm: 20000,
        intervalMonths: 12,
      },
      {
        itemCode: 'brake_pads',
        titleAr: 'فحص وتغيير تيل الفرامل',
        titleEn: 'Brake Pads',
        intervalKm: 30000,
        intervalMonths: 18,
      },
      {
        itemCode: 'spark_plugs',
        titleAr: 'تغيير شمعات الاحتراق (بوجيهات)',
        titleEn: 'Spark Plugs',
        intervalKm: 50000,
        intervalMonths: 36,
      },
      {
        itemCode: 'trans_fluid',
        titleAr: 'فحص وتغيير زيت ناقل الحركة (الفتيس)',
        titleEn: 'Transmission Fluid',
        intervalKm: 60000,
        intervalMonths: 36,
      },
      {
        itemCode: 'coolant',
        titleAr: 'تغيير سائل تبريد المحرك',
        titleEn: 'Coolant Flush',
        intervalKm: 60000,
        intervalMonths: 36,
      },
    ],
    confidenceNotes: `جدول الصيانة القياسي المعتمد هندسياً لـ ${make} ${model} (${year})`,
  };
}

/**
 * Diagnostic Car Doctor Rule-Based Engine:
 * Structured mechanical diagnostic advice for when no external AI is reachable.
 * The knowledge base is Arabic-authored with an English overlay, so this offline
 * fallback answers in the request language instead of always in Arabic.
 */
interface RuleText {
  ar: string;
  en: string;
}

interface DoctorRule {
  /** Matched case-insensitively against the query, in any supported language. */
  keywords: string[];
  cause: RuleText;
  urgency: RuleText;
  steps: RuleText[];
  parts: RuleText[];
}

const DOCTOR_RULES: DoctorRule[] = [
  {
    keywords: ['فرامل', 'تيل', 'طنابير', 'تصفير', 'تزييق', 'brake', 'pad', 'squeal', 'rotor', 'hamulc', 'klock'],
    cause: {
      ar: 'تآكل في بطانات الفرامل (تيل الفرامل) أو ترسب أتربة وشحوم على الطنابير أو اهتراء صفيحة التحذير المعدنية.',
      en: 'Worn brake pads, or dust and grease deposited on the discs, or a degraded metallic wear-warning shim.',
    },
    urgency: {
      ar: 'مرتفعة — الفرامل عنصر أمان أساسي، يجب فحص سمك التيل فورا.',
      en: 'High — braking is a primary safety system; check pad thickness immediately.',
    },
    steps: [
      {
        ar: 'فحص سمك تيل الفرامل الأمامي والخلفي (إذا كان أقل من 3 مم يجب استبداله فوراً).',
        en: 'Measure front and rear pad thickness (replace immediately below 3 mm).',
      },
      {
        ar: 'فحص سطح الطنابير للتأكد من خلوها من التموجات أو الشفاه العميقة.',
        en: 'Inspect the disc surfaces for warping or deep lips.',
      },
      {
        ar: 'تنظيف وتزييت بنوز الكاليبير بشحم حراري مخصص للفرامل.',
        en: 'Clean and lubricate the caliper pins with a brake-specific high-temperature grease.',
      },
    ],
    parts: [
      {
        ar: 'طقم تيل فرامل أمامي أصلي أو كوري/ياباني عالي الجودة',
        en: 'Front brake pad set, genuine or high-grade Japanese/Korean',
      },
      {
        ar: 'خرط أو استبدال الطنابير إذا وُجدت ريجة',
        en: 'Disc skimming or replacement if scoring is present',
      },
    ],
  },
  {
    keywords: ['حرارة', 'سخونة', 'غليان', 'مياه', 'قربة', 'overheat', 'coolant', 'temperature', 'radiator', 'thermo', 'przegrz'],
    cause: {
      ar: 'خلل في دورة التبريد: قد يكون ثرموستات الكوعة معلقاً، أو عطل في سرعات مروحة الردياتير، أو تسريب في خراطيم المياه، أو انسداد في الردياتير.',
      en: 'Cooling circuit fault: a stuck thermostat, failed radiator fan speeds, a leaking hose, or a blocked radiator.',
    },
    urgency: {
      ar: 'خطيرة للغاية ⚠️ — توقف فوراً ولا تقم بالسير أثناء ارتفاع الحرارة حتى لا يتعرض وش السلندر للتقوس أو التلف.',
      en: 'Critical ⚠️ — stop immediately and do not drive while the engine is hot, or the cylinder head may warp or crack.',
    },
    steps: [
      {
        ar: 'فحص مستوى سائل التبريد في القربة والردياتير (بعد أن يبرد المحرك تماماً).',
        en: 'Check the coolant level in the expansion tank and radiator (only once the engine is fully cold).',
      },
      {
        ar: 'التأكد من تشغيل مروحة التبريد عند وصول المحرك لحرارة التشغيل الطبيعية.',
        en: 'Confirm the cooling fan switches on at normal operating temperature.',
      },
      {
        ar: 'فحص غطاء القربة والردياتير بحثاً عن أي تنفيس في الضغط.',
        en: 'Inspect the tank and radiator caps for pressure venting.',
      },
    ],
    parts: [
      { ar: 'ثرموستات كوعة حرارة أصلي', en: 'Genuine thermostat at the correct opening temperature' },
      { ar: 'سائل تبريد أصلي مخفف 50/50', en: 'Genuine coolant premixed 50/50' },
      { ar: 'غطاء قربة أو ردياتير جديد', en: 'New expansion tank or radiator cap' },
    ],
  },
  {
    keywords: ['رعشة', 'تفتفة', 'تقطيع', 'عزم', 'سحب', 'misfire', 'vibration', 'power loss', 'hesitat', 'judder', 'szarp'],
    cause: {
      ar: 'خلل في منظومة الإشعال أو دورة الوقود: بوجيهات مستهلكة، كويل إشعال ضعيف، انسداد في فلتر البنزين، أو اتساخ بوابة الهواء (الثروتل).',
      en: 'Ignition or fuel-system fault: worn spark plugs, a weak ignition coil, a blocked fuel filter, or a dirty throttle body.',
    },
    urgency: {
      ar: 'متوسطة — يفضل فحصها قريباً لتجنب تلف علبة البيئة (دبة التلوث).',
      en: 'Medium — inspect soon; unburnt fuel will damage the catalytic converter.',
    },
    steps: [
      {
        ar: 'فحص شمعات الاحتراق (البوجيهات) والتأكد من خلوها من آثار الكربون أو الزيت.',
        en: 'Inspect the spark plugs for carbon or oil fouling.',
      },
      {
        ar: 'فحص كويلات الإشعال بواسطة جهاز فحص الأعطال OBD-II وقراءة كود Misfire.',
        en: 'Test the ignition coils with an OBD-II scanner and read the misfire codes.',
      },
      {
        ar: 'تنظيف بوابة الهواء (Throttle Body) وإعادة برمجتها.',
        en: 'Clean the throttle body and relearn its adaptation values.',
      },
    ],
    parts: [
      { ar: 'طقم بوجيهات إيريديوم أصلية', en: 'Genuine iridium spark plug set' },
      { ar: 'كويل إشعال (حسب الفحص)', en: 'Ignition coil (as diagnosed)' },
      { ar: 'منظف ثروتل إلكتروني', en: 'Electronic throttle body cleaner' },
    ],
  },
  {
    keywords: ['دخان', 'نقص زيت', 'موتور زيت', 'smoke', 'oil burn', 'oil leak', 'oil loss', 'blue smoke', 'dym', 'olej'],
    cause: {
      ar: 'استهلاك أو تسريب زيت المحرك: قد يكون بسبب تلف جلد الصبابات، شنابر البساتم، أو تسريب خارجي من جوان غطاء التاكيهات أو أولسيهات الكرنك.',
      en: 'Engine oil consumption or leak: worn valve stem seals, piston rings, or an external leak from the valve cover gasket or crankshaft seals.',
    },
    urgency: {
      ar: 'مرتفعة — يجب قياس منسوب الزيت بالمقاس قبل تحريك السيارة.',
      en: 'High — check the oil level on the dipstick before moving the car.',
    },
    steps: [
      {
        ar: 'قياس الزيت والسيارة متوقفة على أرض مستوية بعد 10 دقائق من إيقاف المحرك.',
        en: 'Read the dipstick with the car on level ground, 10 minutes after shutdown.',
      },
      {
        ar: 'فحص أسفل السيارة ومحيط المحرك للتأكد من عدم وجود تسريب زيت خارجي.',
        en: 'Inspect under the car and around the engine for external oil leaks.',
      },
      {
        ar: 'ملاحظة لون العادم (دخان أزرق عند التشغيل الصباحي يعني جلد صباب، دخان مستمر مع التسارع يعني شنابر).',
        en: 'Note the exhaust colour (blue on a cold morning start points to valve seals; blue under sustained acceleration points to rings).',
      },
    ],
    parts: [
      { ar: 'زيت المحرك الموصى به', en: 'The recommended engine oil' },
      { ar: 'جوان غطاء تاكيهات أو طقم جلد صبابات', en: 'Valve cover gasket or valve stem seal set' },
    ],
  },
];

const DOCTOR_GENERIC_URGENCY: RuleText = {
  ar: 'متوسطة — ينصح بالفحص في ورشة متخصصة وتوصيل جهاز الأعطال OBD2.',
  en: 'Medium — have it inspected at a specialised workshop with an OBD2 scan.',
};

const DOCTOR_GENERIC_STEPS: Record<'ar' | 'en', string[]> = {
  ar: [
    'توصيل جهاز كشف الأعطال OBD2 لقراءة أي أكواد مسجلة في كمبيوتر السيارة (DTCs).',
    'مراجعة سجل آخر صيانة للتأكد من عدم تجاوز أي موعد استحقاق.',
    'الفحص البصري للمحرك والعفشة أسفل السيارة.',
  ],
  en: [
    'Connect an OBD2 scanner and read any stored fault codes (DTCs).',
    'Review the last service record to rule out an overdue item.',
    'Visually inspect the engine and the undercarriage.',
  ],
};

const DOCTOR_GENERIC_PARTS: Record<'ar' | 'en', string[]> = {
  ar: ['تحدد بناءً على تقرير فحص الكمبيوتر OBD-II'],
  en: ['Determined by the OBD-II scan report'],
};

export function generateHeuristicDoctorAdvice(
  vehicle: { make: string; model: string; year: number; currentOdometer: number },
  userQuery: string,
  recentMaintenance: any[] = [],
  lang: AiAnswerLang = DEFAULT_AI_LANG
): string {
  const q = userQuery.toLowerCase();
  const odo = vehicle.currentOdometer;
  const side = ruleContentSide(lang);
  const headers = RULE_REPORT_HEADERS[side];
  const km = DOCTOR_FRAMING[lang].km;

  const rule = DOCTOR_RULES.find((r) => r.keywords.some((k) => q.includes(k)));

  const cause = rule
    ? rule.cause[side]
    : side === 'ar'
    ? `تحليل استفسار: "${userQuery}". بالنظر لقراءة عداد السيارة (${odo.toLocaleString()} ${km})، قد يرتبط العطل بالاهتراء الطبيعي للأجزاء الميكانيكية والاستهلاكية.`
    : `Analysis of your question: "${userQuery}". Given the odometer reading (${odo.toLocaleString()} ${km}), the fault may relate to normal wear of mechanical and consumable parts.`;

  const urgency = rule ? rule.urgency[side] : DOCTOR_GENERIC_URGENCY[side];
  const steps = rule ? rule.steps.map((s) => s[side]) : DOCTOR_GENERIC_STEPS[side];
  const parts = rule ? rule.parts.map((p) => p[side]) : DOCTOR_GENERIC_PARTS[side];

  return `${headers.reportTitle(`${vehicle.make} ${vehicle.model} (${vehicle.year})`, odo.toLocaleString(), km)}

${headers.diagnosis}
${cause}

${headers.severity}
${urgency}

${headers.steps}
${steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

${headers.parts}
${parts.map((p) => `• ${p}`).join('\n')}

${headers.footnote}`;
}
