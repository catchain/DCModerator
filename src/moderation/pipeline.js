import { config } from '../config.js';
import { t } from '../texts.js';
import { isImmune } from '../admins.js';
import { getUserMessageCount, recordMessage } from '../db.js';
import { hasInlineButtons } from './inlineButtons.js';
import { findStopword } from './stopwords.js';
import { checkLinks, hasPrivateInviteLink } from './links.js';
import { isFromForeignChannel, isForeignStory, isForeignSenderChat } from './foreignChannel.js';
import { registerAndCheckFlood } from './flood.js';
import { checkJobSpam } from './jobSpam.js';
import { checkAi, isAiEnabled } from './ai.js';
import { checkBio, BAN_VERDICTS } from './bio.js';
import { safeDelete, warnUser, banUser, muteUser, logAction, chatMention } from './actions.js';

// Лог удалений «ссылка в био» — не чаще раза в 10 минут на пользователя.
const BIO_LOG_INTERVAL_MS = 10 * 60 * 1000;
/** @type {Map<number, number>} */
const bioLoggedAt = new Map();
// Лог удалений «от имени канала» — не чаще раза в 10 минут на канал.
/** @type {Map<number, number>} */
const senderChatLoggedAt = new Map();

/**
 * Главный конвейер модерации одного сообщения (нового или отредактированного).
 * Возвращает true, если сообщение было обработано (удалено/наказано).
 */
export async function moderateMessage(ctx) {
  const message = ctx.message ?? ctx.editedMessage;
  const isEdit = !ctx.message;
  if (!message || ctx.chat?.id !== config.moderatedChatId) return false;

  // 1. Иммунитет: админы, анонимные админы, связанный канал.
  if (isImmune(message)) return false;

  // 1.0. Сообщение от имени чужого канала/чата -> только удаление.
  // Автор здесь — служебный Channel_Bot, поэтому варн и бан не применяем.
  if (isForeignSenderChat(message)) {
    await safeDelete(ctx);
    const senderChat = message.sender_chat;
    const last = senderChatLoggedAt.get(senderChat.id) ?? 0;
    if (Date.now() - last > BIO_LOG_INTERVAL_MS) {
      if (senderChatLoggedAt.size > 5000) senderChatLoggedAt.clear();
      senderChatLoggedAt.set(senderChat.id, Date.now());
      await logAction(ctx, {
        actionKey: 'action_delete',
        userHtml: chatMention(senderChat),
        reason: t('reason.sender_chat'),
        text: message.text || message.caption,
      });
    }
    return true;
  }

  const user = message.from;
  if (!user) return false;

  // 1.1. Био автора: telegra.ph или зачёркивающие символы -> бан, любая другая ссылка -> удаление.
  const bio = await checkBio(ctx.telegram, user.id);
  if (BAN_VERDICTS.has(bio.verdict)) {
    await safeDelete(ctx);
    await banUser(ctx, { reasonText: t(`reason.bio_${bio.verdict}`) });
    return true;
  }
  if (bio.verdict === 'link') {
    await safeDelete(ctx);
    const last = bioLoggedAt.get(user.id) ?? 0;
    if (Date.now() - last > BIO_LOG_INTERVAL_MS) {
      if (bioLoggedAt.size > 5000) bioLoggedAt.clear();
      bioLoggedAt.set(user.id, Date.now());
      await logAction(ctx, {
        actionKey: 'action_delete',
        user,
        reason: t('reason.bio_link'),
        text: message.text || message.caption,
      });
    }
    return true;
  }

  // 2. Inline-кнопки -> бан (почти 100% спам).
  if (hasInlineButtons(message)) {
    await safeDelete(ctx);
    await banUser(ctx, { reasonText: t('reason.inline_buttons') });
    return true;
  }

  // 2.1. Пересланная история из чужого чата -> бан (спам-реклама).
  if (isForeignStory(message)) {
    await safeDelete(ctx);
    await banUser(ctx, { reasonText: t('reason.foreign_story') });
    return true;
  }

  // 2.2. Ссылка-приглашение в закрытый канал (t.me/+...) -> бан без предупреждения.
  if (hasPrivateInviteLink(message)) {
    await safeDelete(ctx);
    await banUser(ctx, { reasonText: t('reason.private_invite') });
    return true;
  }

  // Регистрируем сообщение для антифлуда (до возможного удаления). Правки не считаем.
  const floodTriggered = !isEdit && registerAndCheckFlood(user.id);

  // 3. Отправлено через бота (via_bot) -> удалить + варн.
  if (message.via_bot) {
    await safeDelete(ctx);
    await warnUser(ctx, { reasonText: t('reason.via_bot') });
    return true;
  }

  // 3.1. Пересылка/цитата из стороннего канала -> удалить + варн.
  if (isFromForeignChannel(message)) {
    await safeDelete(ctx);
    await warnUser(ctx, { reasonText: t('reason.foreign_channel') });
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

  const isNewbie = getUserMessageCount(config.moderatedChatId, user.id) < config.newbieMessageThreshold;

  // 4.1. Спам-вербовка (см. jobSpam.js). Наркошоп у новичка -> бан, иначе удалить + варн.
  const jobSpam = checkJobSpam(message, { isNewbie });
  if (jobSpam.verdict) {
    await safeDelete(ctx);
    if (jobSpam.verdict === 'drug' && isNewbie) {
      await banUser(ctx, { reasonText: t('reason.job_drug') });
    } else {
      await warnUser(ctx, { reasonText: t(`reason.job_${jobSpam.verdict}`) });
    }
    return true;
  }

  // 5. Ссылки (политика: новичкам — любые, остальным — чёрный список).
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

  // Сообщение прошло фильтры — засчитываем в статистику (правку повторно не считаем).
  if (isEdit) return false;
  recordMessage({
    chatId: config.moderatedChatId,
    userId: user.id,
    username: user.username,
    firstName: user.first_name,
  });

  return false;
}
