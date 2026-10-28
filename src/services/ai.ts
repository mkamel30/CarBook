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

const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-31b-it:free',
  'openrouter/free',
];

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
