import { z } from 'zod';

export const aiProposalItemSchema = z.object({
  itemCode: z.string(),
  titleAr: z.string(),
  titleEn: z.string(),
  intervalKm: z.number().positive(),
  intervalMonths: z.number().positive().optional().nullable(),
});

export const aiLookupResponseSchema = z.object({
  recommendedOil: z.string(),
  maintenanceItems: z.array(aiProposalItemSchema),
  confidenceNotes: z.string().optional(),
});

export type AILookupResponse = z.infer<typeof aiLookupResponseSchema>;

export interface AILookupConfig {
  apiKey?: string;
  provider: 'gemini' | 'openrouter';
  customEndpoint?: string;
  model?: string;
}

export const vehicleManualSpecsSchema = z.object({
  engineOilViscosity: z.string(),
  engineOilCapacityLiters: z.string(),
  transmissionFluidType: z.string(),
  coolantType: z.string(),
  brakeFluidType: z.string(),
  tirePressurePsiFront: z.string(),
  tirePressurePsiRear: z.string(),
  fuelTankCapacityLiters: z.string(),
  recommendedFuelOctane: z.string(),
  sparkPlugType: z.string(),
  batterySpec: z.string(),
  generalNotesAr: z.string(),
});

export type VehicleManualSpecs = z.infer<typeof vehicleManualSpecsSchema>;

export const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

/**
 * Fetch full verified vehicle OEM specs manual via AI
 */
export async function lookupFullVehicleManual(
  make: string,
  model: string,
  year: number,
  config: AILookupConfig,
  fetchFn = fetch
): Promise<VehicleManualSpecs> {
  const prompt = `You are a certified master automotive engineer with access to official OEM factory service manuals.
For a ${year} ${make} ${model}, provide exact factory technical specifications and fluid capacities.

Respond with ONLY valid JSON with no markdown and no backticks:
{
  "engineOilViscosity": "0W-20 Full Synthetic (API SP / ILSAC GF-6)",
  "engineOilCapacityLiters": "4.2 لتر مع الفلتر (4.0 لتر بدون فلتر)",
  "transmissionFluidType": "Toyota Genuine CVT Fluid FE (أو المعيار المعتمد للموديل)",
  "coolantType": "Super Long Life Coolant (وردي مخفف 50/50)",
  "brakeFluidType": "DOT 4 أو DOT 5.1",
  "tirePressurePsiFront": "32 PSI (2.2 Bar)",
  "tirePressurePsiRear": "32 PSI (2.2 Bar)",
  "fuelTankCapacityLiters": "50 لتر",
  "recommendedFuelOctane": "بنزين 92 أو 95 خالٍ من الرصاص",
  "sparkPlugType": "إيريديوم أصلي (Iridium Long Life) بفاصل 0.8 مم",
  "batterySpec": "12V 45Ah - 60Ah مع دينامو شحن ذكي",
  "generalNotesAr": "نصائح وإرشادات صيانة هامة لهذا الموديل بالتحديد باللغة العربية"
}`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    const currentModel = config.model || OPENROUTER_MODELS[attempts % OPENROUTER_MODELS.length];
    attempts++;

    try {
      if (!config.apiKey) {
        throw new Error('API key is not configured');
      }

      const endpoint = config.provider === 'openrouter'
        ? (config.customEndpoint || 'https://openrouter.ai/api/v1/chat/completions')
        : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const parsedUrl = new URL(endpoint);
      if (!parsedUrl.protocol.startsWith('https')) {
        throw new Error('Insecure protocol rejected; HTTPS required');
      }
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(parsedUrl.hostname)) {
        throw new Error('Loopback/Internal network access rejected');
      }

      const body = config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:3070';
        headers['X-Title'] = 'Car Maintenance Followup';
      }

      const res = await fetchFn(endpoint, { method: 'POST', headers, body });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI Provider HTTP ${res.status}: ${errorText}`);
      }

      const rawJson = await res.json();
      let textContent = '';
      if (config.provider === 'openrouter') {
        textContent = rawJson.choices?.[0]?.message?.content || '{}';
      } else {
        textContent = rawJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      }

      const jsonString = extractJson(textContent);
      const parsedData = JSON.parse(jsonString);
      return vehicleManualSpecsSchema.parse(parsedData);
    } catch (err: any) {
      lastError = err;
      if (attempts >= maxAttempts) break;
      await new Promise(r => setTimeout(r, 500 * attempts));
    }
  }

  throw new Error(`Manual lookup failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * AI Car Doctor Diagnosis & Consultation
 */
export async function askAiCarDoctor(
  vehicle: { make: string; model: string; year: number; currentOdometer: number },
  userQuery: string,
  recentMaintenance: any[] = [],
  config: AILookupConfig,
  fetchFn = fetch
): Promise<string> {
  const maintSummary = (recentMaintenance || []).slice(0, 5).map(m =>
    `- ${m.serviceDate}: ${m.title} عند عداد ${m.odometer} كم`
  ).join('\n') || 'لا توجد صيانات مسجلة بعد';

  const prompt = `أنت مهندس وخبير صيانة سيارات معتمد ومستشار فني شخصي.
بيانات سيارة المستخدم الحالية:
- الماركة والموديل: ${vehicle.make} ${vehicle.model} (${vehicle.year})
- قراءة العداد الحالية: ${vehicle.currentOdometer.toLocaleString()} كم
- أحدث الصيانات المنفذة في السجل:
${maintSummary}

استفسار أو شكوى المستخدم:
"${userQuery}"

المطلوب:
1. تشخيص السبب المحتمل بدقة مع ربطه بقراءة العداد وسجل الصيانة الموضح أعلاه.
2. نصيحة عملية محددة: ماذا يفحص الفني أولاً؟ وهل العطل آمن للسير أم يستلزم التوقف الفوري؟
3. أرقام أو مواصفات القطع المتوقع استبدالها (إن وُجدت).

أجب باللغة العربية بأسلوب هندسي واضح، نقاط منسقة، ومباشرة وموثوقة.`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    const currentModel = config.model || OPENROUTER_MODELS[attempts % OPENROUTER_MODELS.length];
    attempts++;

    try {
      if (!config.apiKey) throw new Error('API key is not configured');

      const endpoint = config.provider === 'openrouter'
        ? (config.customEndpoint || 'https://openrouter.ai/api/v1/chat/completions')
        : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const body = config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:3070';
        headers['X-Title'] = 'Car Maintenance Followup';
      }

      const res = await fetchFn(endpoint, { method: 'POST', headers, body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const rawJson = await res.json();
      if (config.provider === 'openrouter') {
        return rawJson.choices?.[0]?.message?.content || 'لم يتم استلام رد من المساعد';
      } else {
        return rawJson.candidates?.[0]?.content?.parts?.[0]?.text || 'لم يتم استلام رد من المساعد';
      }
    } catch (err: any) {
      lastError = err;
      if (attempts >= maxAttempts) break;
      await new Promise(r => setTimeout(r, 500 * attempts));
    }
  }

  throw new Error(`Doctor query failed: ${lastError?.message || 'Unknown error'}`);
}

function extractJson(text: string): string {
  // Strip code fences if present
  let cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  // Find opening '{' and matching closing '}'
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return cleaned.substring(startIdx, endIdx + 1);
  }
  return cleaned;
}

/**
 * AI Vehicle Schedule Lookup Service with bounded retry (max 3 attempts).
 * Enforces Core Rule #3: Output is strictly proposed data, validated with Zod,
 * never directly persisted without user review.
 */
export async function lookupVehicleScheduleProposal(
  make: string,
  model: string,
  year: number,
  config: AILookupConfig,
  fetchFn = fetch
): Promise<AILookupResponse> {
  const prompt = `You are a vehicle maintenance expert. For a ${year} ${make} ${model}, provide:
1. Recommended engine oil type/viscosity (e.g. 5W-30 Full Synthetic).
2. Standard recommended periodic maintenance schedule items with intervals in kilometers.

IMPORTANT: Return ONLY a raw JSON object with no explanations, no text before or after, and no backticks.
Schema:
{
  "recommendedOil": "5W-30 Synthetic",
  "maintenanceItems": [
    {
      "itemCode": "engine_oil",
      "titleAr": "تغيير زيت المحرك والفلتر",
      "titleEn": "Engine Oil & Filter",
      "intervalKm": 10000,
      "intervalMonths": 6
    },
    {
      "itemCode": "air_filter",
      "titleAr": "تغيير فلتر الهواء",
      "titleEn": "Air Filter",
      "intervalKm": 20000,
      "intervalMonths": 12
    },
    {
      "itemCode": "brake_pads",
      "titleAr": "فحص وتغيير تيل الفرامل",
      "titleEn": "Brake Pads",
      "intervalKm": 30000,
      "intervalMonths": 18
    },
    {
      "itemCode": "spark_plugs",
      "titleAr": "تغيير شمعات الاحتراق",
      "titleEn": "Spark Plugs",
      "intervalKm": 40000,
      "intervalMonths": 24
    }
  ],
  "confidenceNotes": "Standard manufacturer maintenance intervals"
}`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    const currentModel = config.model || OPENROUTER_MODELS[attempts % OPENROUTER_MODELS.length];
    attempts++;

    try {
      if (!config.apiKey) {
        throw new Error('API key is not configured');
      }

      // Origin / URL validation (prevent SSRF loopback)
      const endpoint = config.provider === 'openrouter'
        ? (config.customEndpoint || 'https://openrouter.ai/api/v1/chat/completions')
        : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(config.apiKey)}`;

      const parsedUrl = new URL(endpoint);
      if (!parsedUrl.protocol.startsWith('https')) {
        throw new Error('Insecure protocol rejected; HTTPS required');
      }
      if (['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'].includes(parsedUrl.hostname)) {
        throw new Error('Loopback/Internal network access rejected');
      }

      const body = config.provider === 'openrouter'
        ? JSON.stringify({
            model: currentModel,
            messages: [{ role: 'user', content: prompt }],
          })
        : JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.provider === 'openrouter') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        headers['HTTP-Referer'] = 'http://localhost:3070';
        headers['X-Title'] = 'Car Maintenance Followup';
      }

      const res = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`AI Provider HTTP ${res.status}: ${errorText}`);
      }

      const rawJson = await res.json();
      let textContent = '';
      if (config.provider === 'openrouter') {
        textContent = rawJson.choices?.[0]?.message?.content || '{}';
      } else {
        textContent = rawJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      }

      const jsonString = extractJson(textContent);
      const parsedData = JSON.parse(jsonString);
      return aiLookupResponseSchema.parse(parsedData);
    } catch (err: any) {
      lastError = err;
      if (attempts >= maxAttempts) {
        break;
      }
      await new Promise(r => setTimeout(r, 500 * attempts));
    }
  }

  throw new Error(`AI lookup failed after ${maxAttempts} attempts: ${lastError?.message || 'Unknown error'}`);
}
