import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeChatId } from './utils/chatId.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

function int(name, def) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function bool(name, def = false) {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export const config = {
  botToken: process.env.BOT_TOKEN || '',

  moderatedChatId: normalizeChatId(process.env.MODERATED_CHAT_ID),
  protectedChannelId: normalizeChatId(process.env.PROTECTED_CHANNEL_ID),
  logChatId: normalizeChatId(process.env.LOG_CHAT_ID),

  newbieMessageThreshold: int('NEWBIE_MESSAGE_THRESHOLD', 5),

  warnLimit: int('WARN_LIMIT', 3),
  warnMuteHours: int('WARN_MUTE_HOURS', 24),

  flood: {
    maxMessages: int('FLOOD_MAX_MESSAGES', 5),
    windowSec: int('FLOOD_WINDOW_SEC', 5),
    muteMin: int('FLOOD_MUTE_MIN', 5),
  },

  aiModeration: bool('AI_MODERATION', false),
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/moderator.db'),
  defaultTopPeriod: process.env.DEFAULT_TOP_PERIOD || '7d',
  adminRefreshMin: int('ADMIN_REFRESH_MIN', 10),

  dataDir: path.resolve(ROOT_DIR, 'data'),
  langDir: path.resolve(ROOT_DIR, 'lang'),
};

/**
 * Проверка обязательных переменных. Кидает ошибку при старте, если что-то не так.
 */
export function validateConfig() {
  const errors = [];
  if (!config.botToken) errors.push('BOT_TOKEN не задан');
  if (!config.moderatedChatId) errors.push('MODERATED_CHAT_ID не задан или некорректен');
  if (config.aiModeration && !config.openaiApiKey) {
    errors.push('AI_MODERATION=true, но OPENAI_API_KEY пуст');
  }
  if (errors.length) {
    throw new Error('Ошибки конфигурации:\n- ' + errors.join('\n- '));
  }
}
