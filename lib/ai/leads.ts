import { callOpenAI, MODELS, type OpenAIResult } from '@/lib/ai/openai';

/**
 * Yoca — AI help for leads (server only).
 * 1. summary: a Turkish brief for the team (need, budget signals, urgency,
 *    fit, spam likelihood, next step, questions to ask).
 * 2. reply: a first reply e-mail draft in the lead's language.
 * Nothing is sent automatically; the admin reviews and sends.
 */

export interface LeadForAI {
  type: 'contact' | 'checkup';
  name: string;
  company: string;
  email: string;
  phone: string;
  locale: string;
  message: string;
  answers: Array<[string, string]>;
  score: number | null;
  note: string;
}

export interface LeadSummary {
  ozet: string;
  ihtiyaclar: string[];
  butce: string;
  aciliyet: 'düşük' | 'orta' | 'yüksek';
  uygunluk: number;
  uygunluk_nedeni: string;
  spam_olasiligi: 'düşük' | 'orta' | 'yüksek';
  sonraki_adim: string;
  sorular: string[];
}

export interface LeadReply {
  konu: string;
  metin: string;
}

const YOCA = `Yoca (Your Own Creative Agency) — Türkiye merkezli bağımsız yaratıcı büyüme partneri; Avrupa, Kafkasya (Bakü), MENA projeleri.
Üç bağlı sistem: Yoca Brand System (konumlandırma, sözel ve görsel kimlik), Yoca Growth Engine (performans kampanyaları, dönüşüm ve analitik, içerik ve SEO), Yoca Scale Framework (otomasyon ve yapay zekâ, ürün ekosistemi, operasyonel araçlar).
Hizmetler: marka stratejisi ve kimlik, web ve dijital deneyimler, büyüme ve performans, kreatif prodüksiyon, yapay zekâ ve otomasyon, dijital ürün geliştirme.
Ücretsiz "Digital Check-Up": 0–100 dijital sağlık skoru veren kısa test.`;

function describe(lead: LeadForAI): string {
  const lines = [
    `Kaynak: ${lead.type === 'contact' ? 'iletişim formu' : `Digital Check-Up (skor ${lead.score ?? '–'}/100)`}`,
    `İsim: ${lead.name}`,
    `Şirket: ${lead.company || '—'}`,
    `E-posta: ${lead.email}`,
    lead.phone ? `Telefon: ${lead.phone}` : '',
    `Dil: ${lead.locale || 'bilinmiyor'}`,
    lead.message ? `Mesaj:\n${lead.message.slice(0, 6000)}` : '',
    lead.answers.length ? `Check-Up cevapları:\n${lead.answers.map(([k, v]) => `- ${k}: ${v}`).join('\n')}` : '',
    lead.note ? `Ekibin notu: ${lead.note.slice(0, 1500)}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

const SUMMARY_SCHEMA = {
  name: 'lead_summary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ozet', 'ihtiyaclar', 'butce', 'aciliyet', 'uygunluk', 'uygunluk_nedeni', 'spam_olasiligi', 'sonraki_adim', 'sorular'],
    properties: {
      ozet: { type: 'string', description: '2-3 cümle, Türkçe' },
      ihtiyaclar: { type: 'array', items: { type: 'string' }, description: 'Somut ihtiyaçlar, en fazla 5' },
      butce: { type: 'string', description: 'Bütçe sinyali; yoksa "belirtilmemiş"' },
      aciliyet: { type: 'string', enum: ['düşük', 'orta', 'yüksek'] },
      uygunluk: { type: 'integer', description: "Yoca hizmetlerine uygunluk 1-5" },
      uygunluk_nedeni: { type: 'string' },
      spam_olasiligi: { type: 'string', enum: ['düşük', 'orta', 'yüksek'] },
      sonraki_adim: { type: 'string', description: 'Ekibin atması gereken tek somut adım' },
      sorular: { type: 'array', items: { type: 'string' }, description: 'İlk görüşmede sorulacak 2-4 soru' },
    },
  },
};

const REPLY_SCHEMA = {
  name: 'lead_reply',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['konu', 'metin'],
    properties: {
      konu: { type: 'string' },
      metin: { type: 'string', description: 'Düz metin e-posta gövdesi, selamlama ve imza dahil' },
    },
  },
};

export function summarizeLead(lead: LeadForAI): Promise<OpenAIResult<LeadSummary>> {
  return callOpenAI<LeadSummary>({
    model: MODELS.editorial,
    system:
      `Sen Yoca'nın yeni iş (business development) asistanısın. Gelen talebi ekip için Türkçe, kısa ve dürüst özetle.\n${YOCA}\n` +
      'Kurallar: Metinde olmayan bilgi uydurma; emin değilsen "belirtilmemiş" yaz. Rastgele harfli isimler, anlamsız şirket adları, alakasız linkler spam işaretidir. ' +
      'Uygunluk 1 = Yoca için anlamsız, 5 = tam hedef müşteri.',
    user: describe(lead),
    schema: SUMMARY_SCHEMA,
    maxOutputTokens: 900,
    timeoutMs: 60_000,
  });
}

const LANGUAGE: Record<string, string> = { tr: 'Türkçe', en: 'English', az: 'Azərbaycan dili' };

export function draftReply(lead: LeadForAI): Promise<OpenAIResult<LeadReply>> {
  const language = LANGUAGE[lead.locale] ?? 'English';
  return callOpenAI<LeadReply>({
    model: MODELS.editorial,
    system:
      `You write the first reply e-mail from Yoca to a new inbound lead. Write ONLY in ${language}.\n${YOCA}\n` +
      'Rules: warm, senior, concise (120-180 words). Thank them, show you understood their specific need in one or two sentences, ' +
      'propose a short intro call and ask 2-3 qualifying questions (goals, timeline, budget range). ' +
      'Never invent prices, timelines, case studies, client names or guarantees. No markdown. ' +
      'Sign off with a team signature in the same language (e.g. "Yoca ekibi" / "The Yoca team"), then a new line "Yoca — Your Own Creative Agency".',
    user: describe(lead),
    schema: REPLY_SCHEMA,
    maxOutputTokens: 900,
    timeoutMs: 60_000,
  });
}
