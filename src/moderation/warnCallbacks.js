import { config } from '../config.js';
import { t } from '../texts.js';
import { isAdmin, isStaticAdmin } from '../admins.js';
import { removeWarn, resetWarns } from '../db.js';
import { clearFlood } from './flood.js';
import { logger } from '../utils/logger.js';

const CALLBACK_RE = /^w(ban|unban|cancel):(\d+):(\d+)$/;

async function deleteWarnMessage(telegram, messageId) {
  if (!messageId) return;
  try {
    await telegram.deleteMessage(config.moderatedChatId, messageId);
  } catch (err) {
    logger.warn('Не удалось удалить сообщение с предупреждением:', err.message);
  }
}

/** Обработка кнопок BAN / Отмена / Разбанить в лог-канале. */
export async function warnLogCallback(ctx) {
  if (ctx.chat?.id !== config.logChatId) return;

  const match = ctx.callbackQuery?.data?.match(CALLBACK_RE);
  if (!match) return;

  if (!isAdmin(ctx.from?.id)) {
    return ctx.answerCbQuery(t('common.admins_only'), { show_alert: true });
  }

  const [, action, userIdStr, msgIdStr] = match;
  const userId = Number(userIdStr);
  const warnMsgId = Number(msgIdStr);
  const { telegram } = ctx;

  if (action === 'ban' && isStaticAdmin(userId)) {
    return ctx.answerCbQuery(t('log.static_admin_protected'), { show_alert: true });
  }

  await deleteWarnMessage(telegram, warnMsgId);

  let statusKey = 'log.cancelled_from_log';
  // После бана остаётся одна кнопка «Разбанить», после разбана — снова BAN.
  let keyboard = [];

  if (action === 'ban') {
    try {
      await telegram.banChatMember(config.moderatedChatId, userId);
      resetWarns(config.moderatedChatId, userId);
      clearFlood(userId);
    } catch (err) {
      logger.warn('Не удалось забанить из лога:', err.message);
      return ctx.answerCbQuery(err.message, { show_alert: true });
    }
    statusKey = 'log.banned_from_log';
    keyboard = [[{ text: t('log.button_unban'), callback_data: `wunban:${userId}:0` }]];
  } else if (action === 'unban') {
    try {
      await telegram.unbanChatMember(config.moderatedChatId, userId, { only_if_banned: true });
    } catch (err) {
      logger.warn('Не удалось разбанить из лога:', err.message);
      return ctx.answerCbQuery(err.message, { show_alert: true });
    }
    statusKey = 'log.unbanned_from_log';
    keyboard = [[{ text: t('log.button_ban'), callback_data: `wban:${userId}:0` }]];
  } else {
    removeWarn(config.moderatedChatId, userId);
  }

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
  } catch (err) {
    logger.warn('Не удалось обновить кнопки в логе:', err.message);
  }

  await ctx.answerCbQuery(t(statusKey));
}
