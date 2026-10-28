import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { evaluateMaintenanceStatus, calculateFuelConsumption } from '@/services/calculator';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const vehicle = await repo.getVehicleById(vehicleId);
    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Vehicle not found' }, { status: 404 });
    }

    const fuelLogs = await repo.getFuelLogsByVehicle(vehicleId);
    const maintenanceLogs = await repo.getMaintenanceLogsByVehicle(vehicleId);
    const schedules = await repo.getSchedulesByVehicle(vehicleId);

    // Maintenance evaluations
    const evaluatedSchedules = schedules.map(s => evaluateMaintenanceStatus(s, vehicle.currentOdometer));

    // Calculate totals
    const totalFuelCost = fuelLogs.reduce((sum, f) => sum + f.totalCost, 0);
    const totalFuelLiters = fuelLogs.reduce((sum, f) => sum + f.liters, 0);
    const totalMaintenanceCost = maintenanceLogs.reduce((sum, m) => sum + m.totalCost, 0);
    const totalExpenses = totalFuelCost + totalMaintenanceCost;

    // Fuel consumption history
    const sortedFuelAsc = [...fuelLogs].sort((a, b) => a.odometer - b.odometer);
    const consumptionStats = [];
    for (let i = 1; i < sortedFuelAsc.length; i++) {
      const prev = sortedFuelAsc[i - 1];
      const curr = sortedFuelAsc[i];
      if (prev.isFullTank && curr.isFullTank) {
        const stats = calculateFuelConsumption(prev, curr);
        if (stats) consumptionStats.push(stats);
      }
    }

    const averageLitersPer100Km = consumptionStats.length > 0
      ? Number((consumptionStats.reduce((acc, c) => acc + c.litersPer100Km, 0) / consumptionStats.length).toFixed(2))
      : null;

    return NextResponse.json({
      success: true,
      data: {
        vehicle,
        summary: {
          totalFuelCost,
          totalFuelLiters,
          totalMaintenanceCost,
          totalExpenses,
          averageLitersPer100Km,
          fuelLogsCount: fuelLogs.length,
          maintenanceLogsCount: maintenanceLogs.length,
        },
        fuelLogs,
        maintenanceLogs,
        schedules: evaluatedSchedules,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
