import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client = null;
let enabled = false;

/**
 * Инициализация AI-модерации. Работает только если AI_MODERATION=true
 * и установлен пакет openai. Бесплатная модель omni-moderation-latest.
 */
export async function initAi() {
  if (!config.aiModeration) return;
  try {
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({ apiKey: config.openaiApiKey });
    enabled = true;
    logger.info('AI-модерация включена (omni-moderation-latest).');
  } catch (err) {
    logger.error('AI-модерация не запущена (нет пакета openai?):', err.message);
    enabled = false;
  }
}

/**
 * Проверяет текст через OpenAI Moderation.
 *
 * @param {string} text
 * @returns {Promise<{ flagged: boolean, category: string|null }>}
 */
export async function checkAi(text) {
  if (!enabled || !text) return { flagged: false, category: null };
  try {
    const res = await client.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });
    const result = res.results?.[0];
    if (result?.flagged) {
      const category = Object.entries(result.categories || {}).find(([, v]) => v)?.[0] || 'flagged';
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
