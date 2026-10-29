# CarBook REST API Reference

All API routes are served under `/api` by the Next.js server runtime. Endpoints return standard JSON responses with `{ success: boolean, data?: any, error?: string }`.

---

## 1. Vehicles API (`/api/vehicles`)

### `GET /api/vehicles`
Returns all registered vehicles.
- **Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "name": "My Daily Driver",
        "make": "Toyota",
        "model": "Corolla",
        "year": 2022,
        "licensePlate": "123 ABC",
        "initialOdometer": 45000,
        "currentOdometer": 52400,
        "recommendedOil": "0W-20 Full Synthetic",
        "specs": { ... }
      }
    ]
  }
  ```

### `POST /api/vehicles`
Registers a new vehicle and initializes default preventive maintenance schedules.
- **Request Body:**
  ```json
  {
    "name": "Family SUV",
    "make": "Hyundai",
    "model": "Tucson",
    "year": 2023,
    "licensePlate": "456 DEF",
    "initialOdometer": 20000,
    "recommendedOil": "5W-30"
  }
  ```

---

## 2. Fuel Logs API (`/api/fuel`)

### `GET /api/fuel?vehicleId=<id>`
Fetches all fuel logs for a specific vehicle in reverse chronological order, including calculated metrics (`litersPer100Km`, `distanceTraveledKm`, `costPerKm`).

### `POST /api/fuel`
Logs a new fuel fill-up.
- **Request Body:**
  ```json
  {
    "vehicleId": "uuid",
    "fillDate": "2026-10-29",
    "odometer": 52400,
    "liters": 42.5,
    "pricePerLiter": 17.00,
    "totalCost": 722.50,
    "isFullTank": true,
    "notes": "Gasoline 95"
  }
  ```

### `PUT /api/fuel`
Updates an existing fuel log entry and dynamically recalculates subsequent consumption metrics.
- **Request Body:** Requires `id` along with updated fields.

### `DELETE /api/fuel?id=<id>`
Deletes a fuel log entry.

---

## 3. Maintenance & Service API (`/api/maintenance`)

### `GET /api/maintenance?vehicleId=<id>`
Fetches all maintenance records for a vehicle, including detailed spare parts breakdowns and workshop details.

### `POST /api/maintenance`
Logs a maintenance event or oil change.
- **Request Body:**
  ```json
  {
    "vehicleId": "uuid",
    "serviceDate": "2026-10-20",
    "odometer": 50000,
    "serviceType": "oil_change",
    "title": "10,000 km Oil & Filter Service",
    "partsList": [
      { "id": "p1", "name": "Full Synthetic 0W-20 4L", "condition": "new", "cost": 1850 },
      { "id": "p2", "name": "OEM Oil Filter", "condition": "new", "cost": 350 }
    ],
    "partsCost": 2200,
    "laborCost": 300,
    "totalCost": 2500,
    "workshop": "Authorized Service Center",
    "notes": "Inspected brake pads and fluid levels",
    "nextDueOdometer": 60000
  }
  ```

### `PUT /api/maintenance`
Updates an existing maintenance record. Requires `id`.

### `DELETE /api/maintenance?id=<id>`
Deletes a maintenance record.

---

## 4. Maintenance Schedules & Alerts API (`/api/schedules`)

### `GET /api/schedules?vehicleId=<id>`
Returns the evaluated maintenance status for all scheduled services (e.g., Engine Oil, Spark Plugs, Transmission Fluid, Brake Pads).
- **Status Enum:**
  - `ok`: Good condition.
  - `due_soon`: Within 1,000 km or 30 days of due date.
  - `overdue`: Odometer has exceeded the scheduled interval.

---

## 5. Vehicle Inspection Report API (`/api/reports`)

### `GET /api/reports?vehicleId=<id>`
Generates a complete consolidated vehicle report for resale or inspection, including:
- Vehicle profile & verified odometer.
- Total fuel and maintenance expenses.
- Lifetime average fuel consumption ($L/100\text{km}$).
- Chronological service logs with parts replacement history.

---

## 6. AI Services API (`/api/ai`)

### `POST /api/ai/manual`
Fetches official OEM factory specifications for a vehicle and saves them into the vehicle record in SQLite.
- **Request Body:** `{ "vehicleId": "uuid" }`
- **Output:** Extracted specs including `engineOilViscosity`, `engineOilCapacityLiters`, `transmissionFluidType`, `coolantType`, `brakeFluidType`, `tirePressurePsiFront`, `tirePressurePsiRear`, `fuelTankCapacityLiters`, `recommendedFuelOctane`, `sparkPlugType`, `batterySpec`, and `generalNotesAr`.

### `POST /api/ai/doctor`
Provides interactive technical consultation grounded in the vehicle's model, current odometer, and recorded service history.
- **Request Body:** `{ "vehicleId": "uuid", "query": "string" }`
- **Output:** `{ "success": true, "data": { "advice": "string" } }`

---

## 7. App Settings API (`/api/settings`)

### `GET /api/settings`
Retrieves configured fuel grades, pricing, and AI provider status (with masked API key).

### `POST /api/settings`
Updates fuel pricing or AI API keys.
- **Request Body:**
  ```json
  {
    "provider": "openrouter",
    "apiKey": "sk-or-v1-...",
    "fuelTypes": [
      { "id": "gasoline_92", "name": "Gasoline 92", "price": 15.25 },
      { "id": "gasoline_95", "name": "Gasoline 95", "price": 17.00 }
    ]
  }
  ```
