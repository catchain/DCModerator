import { config } from '../config.js';
import { t } from '../texts.js';
import { logger } from '../utils/logger.js';
import { addWarn, resetWarns } from '../db.js';
import { clearFlood } from './flood.js';

function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * HTML-упоминание пользователя для отправки в чат/лог.
 */
export function mention(user) {
  if (!user) return t('common.no_username');
  const name = escapeHtml(user.first_name || user.username || t('common.no_username'));
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

export async function safeDelete(ctx) {
  try {
    await ctx.deleteMessage();
    return true;
  } catch (err) {
    logger.warn('Не удалось удалить сообщение:', err.message);
    return false;
  }
}

function warnLogKeyboard(userId, warnMessageId) {
  return {
    inline_keyboard: [
      [
        { text: t('log.button_ban'), callback_data: `wban:${userId}:${warnMessageId}` },
        { text: t('log.button_cancel'), callback_data: `wcancel:${userId}:${warnMessageId}` },
      ],
    ],
  };
}

/**
 * Пишет запись в лог-канал (если задан LOG_CHAT_ID).
 * Для предупреждений с warnMessageId добавляет кнопки BAN / Отмена.
 */
export async function logAction(bot, { actionKey, user, reason, text, warnMessageId }) {
  if (!config.logChatId) return;
  const opts = { parse_mode: 'HTML' };
  if (actionKey === 'action_warn' && warnMessageId && user?.id) {
    opts.reply_markup = warnLogKeyboard(user.id, warnMessageId);
  }
  try {
    await bot.telegram.sendMessage(
      config.logChatId,
      t('log.entry', {
        action: t(`log.${actionKey}`),
        user: mention(user),
        reason: reason || '—',
        text: escapeHtml((text || '').slice(0, 300)) || '—',
      }),
      opts,
    );
  } catch (err) {
    logger.warn('Не удалось записать в лог-канал:', err.message);
  }
}

/**
 * Выдаёт варн. При достижении лимита — мьютит на WARN_MUTE_HOURS часов.
 */
export async function warnUser(ctx, { reasonText }) {
  const chatId = ctx.chat.id;
  const user = ctx.message.from;
  const count = addWarn(chatId, user.id);
  const m = mention(user);
  const originalText = ctx.message.text || ctx.message.caption;

  if (count >= config.warnLimit) {
    const until = Math.floor(Date.now() / 1000) + config.warnMuteHours * 3600;
    try {
      await ctx.telegram.restrictChatMember(chatId, user.id, {
        permissions: { can_send_messages: false },
        until_date: until,
      });
      resetWarns(chatId, user.id);
      clearFlood(user.id);
      await logAction(ctx, {
        actionKey: 'action_warn',
        user,
        reason: reasonText,
        text: originalText,
      });
      await logAction(ctx, {
        actionKey: 'action_mute',
        user,
        reason: t('reason.warn_limit', { hours: config.warnMuteHours }),
        text: '',
      });
    } catch (err) {
      logger.warn('Не удалось замьютить за варны:', err.message);
    }
  } else {
    let warnMessageId;
    try {
      const sent = await ctx.reply(
        t('warn.issued', { user: m, count, limit: config.warnLimit, reason: reasonText }),
        { parse_mode: 'HTML' },
      );
      warnMessageId = sent.message_id;
    } catch (err) {
      logger.warn('Не удалось отправить предупреждение:', err.message);
    }
    await logAction(ctx, {
      actionKey: 'action_warn',
      user,
      reason: reasonText,
      text: originalText,
      warnMessageId,
    });
  }
}

/**
 * Перманентный бан + запись в лог.
 */
export async function banUser(ctx, { reasonText }) {
  const chatId = ctx.chat.id;
  const user = ctx.message.from;
  try {
    await ctx.telegram.banChatMember(chatId, user.id);
    clearFlood(user.id);
  } catch (err) {
    logger.warn('Не удалось забанить:', err.message);
  }
  await logAction(ctx, {
    actionKey: 'action_ban',
    user,
    reason: reasonText,
    text: ctx.message.text || ctx.message.caption,
  });
}

/**
 * Мут на N минут + запись в лог.
 */
export async function muteUser(ctx, { minutes, reasonText }) {
  const chatId = ctx.chat.id;
  const user = ctx.message.from;
  const until = Math.floor(Date.now() / 1000) + minutes * 60;
  try {
    await ctx.telegram.restrictChatMember(chatId, user.id, {
      permissions: { can_send_messages: false },
      until_date: until,
    });
    clearFlood(user.id);
  } catch (err) {
    logger.warn('Не удалось замьютить:', err.message);
  }
  await logAction(ctx, {
    actionKey: 'action_mute',
    user,
    reason: reasonText,
    text: ctx.message.text || ctx.message.caption,
  });
}
