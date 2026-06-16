import { config } from './config.js';
import { logger } from './utils/logger.js';

/** @type {Set<number>} */
let adminIds = new Set();

/**
 * Запрашивает список админов чата и обновляет кэш.
 */
export async function refreshAdmins(bot) {
  try {
    const admins = await bot.telegram.getChatAdministrators(config.moderatedChatId);
    adminIds = new Set(admins.map((a) => a.user.id));
    logger.info(`Кэш админов обновлён: ${adminIds.size} чел.`);
  } catch (err) {
    logger.error('Не удалось получить админов чата:', err.message);
  }
}

/**
 * Запускает периодическое обновление кэша админов.
 */
export function startAdminRefresh(bot) {
  const ms = config.adminRefreshMin * 60 * 1000;
  setInterval(() => refreshAdmins(bot), ms).unref?.();
}

export function isAdmin(userId) {
  return adminIds.has(userId);
}

/**
 * Полный иммунитет от модерации: админ, анонимный админ (от имени чата)
 * либо пост из привязанного канала.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {boolean}
 */
export function isImmune(message) {
  if (!message) return false;

  const isProtectedChannel = (chatId) =>
    chatId !== null && chatId !== undefined && config.protectedChannelIds.has(chatId);

  const senderChat = message.sender_chat;
  if (senderChat) {
    // Анонимный админ постит от имени самого чата.
    if (senderChat.id === config.moderatedChatId) return true;
    // Пост от имени привязанного канала.
    if (isProtectedChannel(senderChat.id)) return true;
  }

  const forwardFrom = message.forward_from_chat;
  if (forwardFrom && isProtectedChannel(forwardFrom.id)) return true;

  // Автопост из связанного канала в обсуждение.
  if (message.is_automatic_forward) {
    if (!forwardFrom || isProtectedChannel(forwardFrom.id)) return true;
  }

  if (message.from && isAdmin(message.from.id)) return true;

  return false;
}
