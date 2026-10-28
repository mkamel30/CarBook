import { NextRequest, NextResponse } from 'next/server';
import { StorageRepository } from '@/persistence/repository';
import { calculateFuelConsumption } from '@/services/calculator';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vehicleId = searchParams.get('vehicleId');
    if (!vehicleId) {
      return NextResponse.json({ success: false, error: 'vehicleId is required' }, { status: 400 });
    }

    const repo = new StorageRepository();
    const rawLogs = await repo.getFuelLogsByVehicle(vehicleId);

    // Compute consumption relative to previous fill-up
    // Sort chronological ascending to pair each log with its predecessor
    const sortedAsc = [...rawLogs].sort((a, b) => {
      const dateCompare = a.fillDate.localeCompare(b.fillDate);
      return dateCompare !== 0 ? dateCompare : a.odometer - b.odometer;
    });

    const enrichedMap = new Map<string, {
      distanceTraveledKm: number | null;
      litersPer100Km: number | null;
      kmPerLiter: number | null;
      costPerKm: number | null;
    }>();

    for (let i = 0; i < sortedAsc.length; i++) {
      const current = sortedAsc[i];
      if (i === 0) {
        // First log has no previous entry
        enrichedMap.set(current.id!, {
          distanceTraveledKm: null,
          litersPer100Km: null,
          kmPerLiter: null,
          costPerKm: null,
        });
        continue;
      }

      // Look back for previous fill-up
      const prev = sortedAsc[i - 1];
      const stats = calculateFuelConsumption(prev, current);

      if (stats) {
        enrichedMap.set(current.id!, {
          distanceTraveledKm: stats.distanceTraveledKm,
          litersPer100Km: stats.litersPer100Km,
          kmPerLiter: stats.kmPerLiter,
          costPerKm: stats.costPerKm,
        });
      } else {
        enrichedMap.set(current.id!, {
          distanceTraveledKm: null,
          litersPer100Km: null,
          kmPerLiter: null,
          costPerKm: null,
        });
      }
    }

    // Attach enriched metrics back to rawLogs (descending order)
    const enrichedLogs = rawLogs.map(log => {
      const metrics = enrichedMap.get(log.id!) || {
        distanceTraveledKm: null,
        litersPer100Km: null,
        kmPerLiter: null,
        costPerKm: null,
      };
      return {
        ...log,
        ...metrics,
      };
    });

    return NextResponse.json({ success: true, data: enrichedLogs });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const repo = new StorageRepository();
    const log = await repo.addFuelLog(body);
    return NextResponse.json({ success: true, data: log });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Log id is required' }, { status: 400 });
    }
    const repo = new StorageRepository();
    const updated = await repo.updateFuelLog(id, data);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Log id is required' }, { status: 400 });
    }
    const repo = new StorageRepository();
    await repo.deleteFuelLog(id);
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
