import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeChatId, parseChatIdList } from './utils/chatId.js';

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

/** Постоянные админы: всегда в списке, независимо от Telegram. */
function parseUserIdList(raw, defaults = []) {
  const ids = new Set(defaults);
  if (!raw) return ids;
  for (const part of raw.split(',')) {
    const n = Number.parseInt(part.trim(), 10);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids;
}

/** Постоянные админы по умолчанию. Бот никогда их не модерирует. */
const DEFAULT_STATIC_ADMIN_IDS = [
  268341399, 336163, 6808848998, 897796, 193824343, 56077720, 1761163019,
];

/** Белый список по умолчанию: без прав админа, но бот их никогда не модерирует. */
const DEFAULT_WHITELIST_USER_IDS = [
  8804799652, 8740644952, 9298402411, 1583813260, 7698764484, 8331038741,
  7292340731, 8261766312, 146337173, 9205082739, 9051507190, 8688598951,
  8637833487, 8693780709, 9123783343,
];

export const config = {
  botToken: process.env.BOT_TOKEN || '',

  moderatedChatId: normalizeChatId(process.env.MODERATED_CHAT_ID),
  protectedChannelIds: parseChatIdList('PROTECTED_CHANNEL_ID'),
  logChatId: normalizeChatId(process.env.LOG_CHAT_ID),

  newbieMessageThreshold: int('NEWBIE_MESSAGE_THRESHOLD', 5),

  warnLimit: int('WARN_LIMIT', 3),
  warnMuteHours: int('WARN_MUTE_HOURS', 24),
  // Через сколько секунд удалять предупреждение из чата (0 — не удалять).
  warnMessageTtlSec: int('WARN_MESSAGE_TTL_SEC', 30),

  flood: {
    maxMessages: int('FLOOD_MAX_MESSAGES', 5),
    windowSec: int('FLOOD_WINDOW_SEC', 5),
    muteMin: int('FLOOD_MUTE_MIN', 5),
  },

  // AI-модерация включается сама, если задан OPENCODE_API_KEY.
  ai: {
    apiKey: process.env.OPENCODE_API_KEY || '',
    baseUrl: 'https://opencode.ai/zen/v1',
    model: 'gpt-5.4-nano',
    timeoutMs: 15000,
  },

  dbPath: path.resolve(ROOT_DIR, process.env.DB_PATH || './data/moderator.db'),
  defaultTopPeriod: process.env.DEFAULT_TOP_PERIOD || '7d',
  adminRefreshMin: int('ADMIN_REFRESH_MIN', 10),
  staticAdminIds: parseUserIdList(process.env.STATIC_ADMIN_IDS, DEFAULT_STATIC_ADMIN_IDS),
  whitelistUserIds: parseUserIdList(process.env.WHITELIST_USER_IDS, DEFAULT_WHITELIST_USER_IDS),

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
  if (errors.length) {
    throw new Error('Ошибки конфигурации:\n- ' + errors.join('\n- '));
  }
}
