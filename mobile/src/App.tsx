import { useEffect, useState } from 'react';
import { makeDatabase } from './device/database';
import { localCreate } from './device/writer';

// Minimal proof the offline data layer boots inside the WebView: creates one
// vehicle locally and shows the device DB count. The real UI will reuse the
// shared src/components once Phase 1 wires the shell.
export default function App() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const db = makeDatabase();
    db.write(async () => {
      await localCreate(db, 'vehicles', 'boot-check', {
        name: 'Offline Boot', make: 'CarBook', model: 'Shell', year: 2026,
        initial_odometer: 0, current_odometer: 0,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
    })
      .then(() => db.collections.get('vehicles' as any).query().fetch())
      .then(rows => setCount(rows.length))
      .catch(() => setCount(-1));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>CarBook offline shell</h1>
      <p>
        Local device DB ready. Vehicles stored offline: {count === null ? '…' : count}
      </p>
    </div>
  );
}
