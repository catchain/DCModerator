import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client = null;
let enabled = false;

const CATEGORIES = ['spam', 'scam', 'drugs'];

const SYSTEM_PROMPT = `Ты модератор Telegram-чата о криптовалюте и сети TON.
Оцени одно сообщение пользователя. Нарушения:
- spam: реклама, рассылки, накрутки, «пиши в лс», набор в команды/работа с заработком;
- scam: мошенничество, фейковые раздачи, просьбы прислать сид-фразу или средства;
- drugs: продажа запрещённых веществ.
Оскорбления, мат, грубость, споры, 18+, обычные вопросы и ссылки на тему чата — НЕ нарушение.
Если сомневаешься — не нарушение.
Ответь только JSON без пояснений: {"flagged": true|false, "category": "<одна из: ${CATEGORIES.join(', ')}>"|null}`;

/**
 * Инициализация AI-модерации через OpenCode Zen (OpenAI-совместимый API).
 * Включается, если задан OPENCODE_API_KEY.
 */
export async function initAi() {
  if (!config.ai.apiKey) return;
  try {
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseUrl,
      timeout: config.ai.timeoutMs,
      maxRetries: 0,
    });
    enabled = true;
    logger.info(`AI-модерация включена (${config.ai.baseUrl}, модель ${config.ai.model}).`);
  } catch (err) {
    logger.error('AI-модерация не запущена (нет пакета openai?):', err.message);
    enabled = false;
  }
}

function parseVerdict(raw) {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/**
 * Проверяет текст через LLM.
 *
 * @param {string} text
 * @returns {Promise<{ flagged: boolean, category: string|null }>}
 */
export async function checkAi(text) {
  if (!enabled || !text) return { flagged: false, category: null };
  try {
    const res = await client.chat.completions.create({
      model: config.ai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 4000) },
      ],
    });
    const verdict = parseVerdict(res.choices?.[0]?.message?.content);
    if (verdict?.flagged === true) {
      const category = CATEGORIES.includes(verdict.category) ? verdict.category : 'flagged';
      return { flagged: true, category };
    }
  } catch (err) {
    logger.warn('Ошибка AI-модерации:', err.message);
  }
  return { flagged: false, category: null };
}

export function isAiEnabled() {
  return enabled;
}
