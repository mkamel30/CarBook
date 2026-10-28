import { z } from 'zod';

export const vehicleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Vehicle name is required'),
  make: z.string().min(1, 'Make is required'),
  model: z.string().min(1, 'Model is required'),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  licensePlate: z.string().optional().nullable(),
  initialOdometer: z.number().nonnegative('Initial odometer cannot be negative'),
  currentOdometer: z.number().nonnegative('Current odometer cannot be negative'),
  recommendedOil: z.string().optional().nullable(),
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

export const maintenanceLogSchema = z.object({
  id: z.string().uuid().optional(),
  vehicleId: z.string().uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  odometer: z.number().nonnegative('Odometer cannot be negative'),
  serviceType: z.enum(['oil_change', 'periodic', 'repair', 'inspection', 'tires', 'brakes', 'other']),
  title: z.string().min(1, 'Title is required'),
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
