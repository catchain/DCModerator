import { config } from './config.js';
import { t } from './texts.js';
import { logger } from './utils/logger.js';

// Альбом приходит несколькими сообщениями с одним media_group_id — отвечаем один раз.
/** @type {Set<string>} */
const seenMediaGroups = new Set();

/**
 * Автопост из привязанного канала в чат обсуждений.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {boolean}
 */
export function isChannelPost(message) {
  if (!message?.is_automatic_forward) return false;
  const channelId = message.sender_chat?.id ?? message.forward_from_chat?.id;
  // Если PROTECTED_CHANNEL_ID не задан, считаем своим любой автопост.
  if (config.protectedChannelIds.size === 0) return true;
  return channelId !== undefined && config.protectedChannelIds.has(channelId);
}

/**
 * Под каждым новым постом канала оставляет комментарий с кратким описанием правил.
 * Возвращает true, если сообщение было постом канала.
 */
export async function commentRulesUnderPost(ctx) {
  const message = ctx.message;
  if (!message || ctx.chat?.id !== config.moderatedChatId) return false;
  if (!isChannelPost(message)) return false;

  if (message.media_group_id) {
    if (seenMediaGroups.has(message.media_group_id)) return true;
    if (seenMediaGroups.size > 500) seenMediaGroups.clear();
    seenMediaGroups.add(message.media_group_id);
  }

  try {
    await ctx.telegram.sendMessage(config.moderatedChatId, t('rules.channel_post'), {
      parse_mode: 'HTML',
      reply_parameters: { message_id: message.message_id },
      link_preview_options: { is_disabled: true },
    });
  } catch (err) {
    logger.warn('Не удалось отправить правила под постом канала:', err.message);
  }
  return true;
}
