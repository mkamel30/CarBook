import { z } from 'zod';

export const vehicleSpecsSchema = z.object({
  engineOilViscosity: z.string().optional().nullable(),
  engineOilCapacityLiters: z.string().optional().nullable(),
  transmissionFluidType: z.string().optional().nullable(),
  coolantType: z.string().optional().nullable(),
  brakeFluidType: z.string().optional().nullable(),
  tirePressurePsiFront: z.string().optional().nullable(),
  tirePressurePsiRear: z.string().optional().nullable(),
  fuelTankCapacityLiters: z.string().optional().nullable(),
  recommendedFuelOctane: z.string().optional().nullable(),
  sparkPlugType: z.string().optional().nullable(),
  batterySpec: z.string().optional().nullable(),
  generalNotesAr: z.string().optional().nullable(),
});

export type VehicleSpecs = z.infer<typeof vehicleSpecsSchema>;

export const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().optional().nullable(),
  name: z.string().min(1, 'Vehicle name is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  licensePlate: z.string().optional().nullable(),
  initialOdometer: z.number().nonnegative('Initial odometer cannot be negative'),
  currentOdometer: z.number().nonnegative('Current odometer cannot be negative'),
  recommendedOil: z.string().optional().nullable(),
  specs: vehicleSpecsSchema.optional().nullable(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Vehicle = z.infer<typeof vehicleSchema>;

export const maintenanceScheduleSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid(),
  itemCode: z.string().min(1),
  titleAr: z.string().min(1, 'Arabic title is required'),
  titleEn: z.string().min(1, 'English title is required'),
  intervalKm: z.number().positive('Interval km must be greater than zero'),
  intervalMonths: z.number().positive('Interval months must be greater than zero').optional().nullable(),
  lastDoneOdometer: z.number().nonnegative().optional().nullable(),
  lastDoneDate: z.string().optional().nullable(), // YYYY-MM-DD
});

export type MaintenanceSchedule = z.infer<typeof maintenanceScheduleSchema>;

export const maintenancePartItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Part name is required'),
  condition: z.enum(['new', 'used_import']), // جديدة أو استيراد
  cost: z.number().nonnegative(),
});

export type MaintenancePartItem = z.infer<typeof maintenancePartItemSchema>;

export const maintenanceLogSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  odometer: z.number().nonnegative('Odometer cannot be negative'),
  serviceType: z.enum(['oil_change', 'periodic', 'repair', 'inspection', 'tires', 'brakes', 'other']),
  title: z.string().min(1, 'Title is required'),
  partsList: z.array(maintenancePartItemSchema).optional().nullable(),
  partsCost: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  totalCost: z.number().nonnegative(),
  workshop: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextDueOdometer: z.number().nonnegative().optional().nullable(),
  nextDueDate: z.string().optional().nullable(),
  createdAt: z.string().datetime().optional(),
});

export type MaintenanceLog = z.infer<typeof maintenanceLogSchema>;

export const fuelLogSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid(),
  fillDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  odometer: z.number().nonnegative('Odometer cannot be negative'),
  liters: z.number().positive('Liters must be greater than zero'),
  pricePerLiter: z.number().positive('Price per liter must be greater than zero'),
  totalCost: z.number().positive('Total cost must be greater than zero'),
  isFullTank: z.boolean().default(true),
  notes: z.string().optional().nullable(),
  createdAt: z.string().datetime().optional(),
});

export type FuelLog = z.infer<typeof fuelLogSchema>;

export const appSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  isEncrypted: z.boolean().default(false),
  updatedAt: z.string().datetime().optional(),
});

export type AppSetting = z.infer<typeof appSettingSchema>;
