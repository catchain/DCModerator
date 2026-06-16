import { config } from '../config.js';
import { t } from '../texts.js';
import { isImmune } from '../admins.js';
import { getUserMessageCount, recordMessage } from '../db.js';
import { hasInlineButtons } from './inlineButtons.js';
import { findStopword } from './stopwords.js';
import { checkLinks } from './links.js';
import { registerAndCheckFlood } from './flood.js';
import { checkAi, isAiEnabled } from './ai.js';
import { safeDelete, warnUser, banUser, muteUser } from './actions.js';

/**
 * Главный конвейер модерации одного сообщения.
 * Возвращает true, если сообщение было обработано (удалено/наказано).
 */
export async function moderateMessage(ctx) {
  const message = ctx.message;
  if (!message || ctx.chat?.id !== config.moderatedChatId) return false;

  // 1. Иммунитет: админы, анонимные админы, связанный канал.
  if (isImmune(message)) return false;

  const user = message.from;
  if (!user) return false;

  // 2. Inline-кнопки -> бан (почти 100% спам).
  if (hasInlineButtons(message)) {
    await safeDelete(ctx);
    await banUser(ctx, { reasonText: t('reason.inline_buttons') });
    return true;
  }

  // Регистрируем сообщение для антифлуда (до возможного удаления).
  const floodTriggered = registerAndCheckFlood(user.id);

  // 3. Отправлено через бота (via_bot) -> удалить + варн.
  if (message.via_bot) {
    await safeDelete(ctx);
    await warnUser(ctx, { reasonText: t('reason.via_bot') });
    return true;
  }

  const text = message.text || message.caption || '';

  // 4. Стоп-слова.
  const stopword = findStopword(text);
  if (stopword) {
    await safeDelete(ctx);
    await warnUser(ctx, { reasonText: t('reason.stopword') });
    return true;
  }

  // 5. Ссылки (политика: новичкам — любые, остальным — чёрный список).
  const isNewbie = getUserMessageCount(config.moderatedChatId, user.id) < config.newbieMessageThreshold;
  const linkVerdict = checkLinks(message, { isNewbie });
  if (linkVerdict.block) {
    await safeDelete(ctx);
    await warnUser(ctx, { reasonText: t(`reason.${linkVerdict.reason}`) });
    return true;
  }

  // 6. AI-модерация (опционально).
  if (isAiEnabled() && text) {
    const ai = await checkAi(text);
    if (ai.flagged) {
      await safeDelete(ctx);
      await warnUser(ctx, { reasonText: t('reason.ai', { category: ai.category }) });
      return true;
    }
  }

  // 7. Антифлуд.
  if (floodTriggered) {
    await safeDelete(ctx);
    await muteUser(ctx, {
      minutes: config.flood.muteMin,
      reasonText: t('reason.flood', { minutes: config.flood.muteMin }),
    });
    return true;
  }

  // Сообщение прошло фильтры — засчитываем в статистику.
  recordMessage({
    chatId: config.moderatedChatId,
    userId: user.id,
    username: user.username,
    firstName: user.first_name,
  });

  return false;
}
