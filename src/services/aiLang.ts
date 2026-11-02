/**
 * Answer-language layer for the AI services.
 *
 * WHY THIS EXISTS
 * The doctor prompt hardcoded Arabic labels and "أجب باللغة العربية", so an
 * English or Polish user got an Arabic reply even after switching the whole UI.
 * The language choice lives client-side (localStorage 'carbook_lang'), so the
 * server can only honour it if every /api/ai/doctor request states it.
 *
 * The accepted set is pinned to the app's supported UI languages and everything
 * else degrades to the product default: these strings are interpolated into a
 * prompt sent to an external provider, so a spoofed value must not pass through.
 *
 * Scope note: the vehicle *specification* lookups are deliberately NOT
 * language-aware — their results are cached globally per make/model/year and
 * shared across accounts, so their schema stays bilingual (titleAr/titleEn,
 * generalNotesAr/generalNotesEn) and the UI picks a side at render time.
 */

export type AiAnswerLang = 'ar' | 'en' | 'pl';

/** Product default: CarBook is Arabic-first. */
export const DEFAULT_AI_LANG: AiAnswerLang = 'ar';

const AI_LANGS: readonly AiAnswerLang[] = ['ar', 'en', 'pl'];

export function normalizeAiLang(input: unknown): AiAnswerLang {
  return typeof input === 'string' && (AI_LANGS as readonly string[]).includes(input)
    ? (input as AiAnswerLang)
    : DEFAULT_AI_LANG;
}

export interface DoctorFraming {
  /** Label used in the history summary line, e.g. "at odometer". */
  atOdometer: string;
  odometer: string;
  engineCapacity: string;
  recentServices: string;
  noHistory: string;
  km: string;
  /** Sentence that fixes the reply language — the only part that really varies. */
  answerInstruction: string;
  /** Returned when the provider answered with an empty body. */
  noReply: string;
}

export const DOCTOR_FRAMING: Record<AiAnswerLang, DoctorFraming> = {
  ar: {
    atOdometer: 'عند عداد',
    odometer: 'قراءة العداد الحالية',
    engineCapacity: 'سعة المحرك',
    recentServices: 'أحدث الصيانات المنفذة في السجل',
    noHistory: 'لا توجد صيانات مسجلة بعد',
    km: 'كم',
    answerInstruction: 'أجب باللغة العربية بأسلوب هندسي واضح ونقاط منسقة ومباشرة وموثوقة.',
    noReply: 'لم يتم استلام رد من المساعد',
  },
  en: {
    atOdometer: 'at odometer',
    odometer: 'Current odometer reading',
    engineCapacity: 'Engine capacity',
    recentServices: 'Most recent services in the log',
    noHistory: 'No maintenance recorded yet',
    km: 'km',
    answerInstruction: 'Write the full answer in English, in the terminology an English-speaking workshop would use.',
    noReply: 'The assistant returned no reply',
  },
  pl: {
    atOdometer: 'na liczniku',
    odometer: 'Aktualny stan licznika',
    engineCapacity: 'Pojemność silnika',
    recentServices: 'Ostatnie serwisy w historii',
    noHistory: 'Brak zapisanych serwisów',
    km: 'km',
    answerInstruction: 'Write the full answer in Polish, in the terminology a Polish-speaking workshop would use.',
    noReply: 'Asystent nie zwrócił odpowiedzi',
  },
};

/**
 * Headings for the offline rule-engine report (see generateHeuristicDoctorAdvice).
 * Only two sides exist: the rule knowledge base is authored in Arabic with an
 * English overlay, exactly like the vehicle spec data. Polish reads the English
 * side, which is the convention every other bilingual field in the app follows.
 */
export type RuleContentSide = 'ar' | 'en';

export function ruleContentSide(lang: AiAnswerLang): RuleContentSide {
  return lang === 'ar' ? 'ar' : 'en';
}

export interface RuleReportHeaders {
  reportTitle: (vehicle: string, odometer: string, km: string) => string;
  diagnosis: string;
  severity: string;
  steps: string;
  parts: string;
  footnote: string;
}

export const RULE_REPORT_HEADERS: Record<RuleContentSide, RuleReportHeaders> = {
  ar: {
    reportTitle: (vehicle, odo, km) =>
      `### 🩺 تقرير المستشار الفني لسيارة ${vehicle} — عداد: ${odo} ${km}`,
    diagnosis: '**1. التشخيص الهندسي والسبب المحتمل:**',
    severity: '**2. درجة خطورة العطل وتوجيهات السلامة:**',
    steps: '**3. خطوات الفحص المقترحة للفني:**',
    parts: '**4. القطع المتوقع استبدالها:**',
    footnote:
      '> *ملاحظة هندسية: تم استخراج هذا التشخيص بناءً على قاعدة بيانات الصيانة الهندسية المعتمدة وسجل قياسات السيارة.*',
  },
  en: {
    reportTitle: (vehicle, odo, km) =>
      `### 🩺 Technical advisor report for ${vehicle} — odometer: ${odo} ${km}`,
    diagnosis: '**1. Engineering diagnosis and probable cause:**',
    severity: '**2. Fault severity and safety guidance:**',
    steps: '**3. Inspection steps for the technician:**',
    parts: '**4. Parts likely to be replaced:**',
    footnote:
      '> *Engineering note: this diagnosis comes from the approved engineering maintenance knowledge base and the vehicle measurement log.*',
  },
};
