import { config } from '../config.js';
import { t } from '../texts.js';
import { isAdmin } from '../admins.js';
import { removeWarn, resetWarns } from '../db.js';
import { clearFlood } from './flood.js';
import { logger } from '../utils/logger.js';

const CALLBACK_RE = /^w(ban|cancel):(\d+):(\d+)$/;

async function deleteWarnMessage(telegram, messageId) {
  if (!messageId) return;
  try {
    await telegram.deleteMessage(config.moderatedChatId, messageId);
  } catch (err) {
    logger.warn('Не удалось удалить сообщение с предупреждением:', err.message);
  }
}

/** Обработка кнопок BAN / Отмена в лог-канале. */
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

  await deleteWarnMessage(telegram, warnMsgId);

  const statusKey = action === 'ban' ? 'log.banned_from_log' : 'log.cancelled_from_log';

  if (action === 'ban') {
    try {
      await telegram.banChatMember(config.moderatedChatId, userId);
      resetWarns(config.moderatedChatId, userId);
      clearFlood(userId);
    } catch (err) {
      logger.warn('Не удалось забанить из лога:', err.message);
      return ctx.answerCbQuery(err.message, { show_alert: true });
    }
  } else {
    removeWarn(config.moderatedChatId, userId);
  }

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (err) {
    logger.warn('Не удалось убрать кнопки в логе:', err.message);
  }

  await ctx.answerCbQuery(t(statusKey));
}
