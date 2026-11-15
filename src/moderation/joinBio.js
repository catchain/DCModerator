import { config } from '../config.js';
import { t } from '../texts.js';
import { logger } from '../utils/logger.js';
import { isAdmin, isStaticAdmin } from '../admins.js';
import { checkBio, BAN_VERDICTS } from './bio.js';
import { logAction } from './actions.js';
import { clearFlood } from './flood.js';

// Один и тот же вход приходит дважды (chat_member + new_chat_members): не баним повторно.
const RECENT_MS = 60 * 1000;
/** @type {Map<number, number>} */
const recent = new Map();

function seenRecently(userId) {
  const now = Date.now();
  for (const [id, at] of recent) if (now - at > RECENT_MS) recent.delete(id);
  if (recent.has(userId)) return true;
  recent.set(userId, now);
  return false;
}

/**
 * Проверка био при входе в чат: telegra.ph или зачёркивающие символы -> бан до первого сообщения.
 * Обычную ссылку здесь не наказываем: её обработает конвейер при первом сообщении.
 */
export async function checkJoinedUser(telegram, user) {
  if (!user || user.is_bot) return;
  if (isAdmin(user.id) || isStaticAdmin(user.id)) return;
  if (seenRecently(user.id)) return;

  const { verdict } = await checkBio(telegram, user.id);
  if (!BAN_VERDICTS.has(verdict)) return;

  try {
    await telegram.banChatMember(config.moderatedChatId, user.id);
    clearFlood(user.id);
  } catch (err) {
    logger.warn('Не удалось забанить при входе:', err.message);
  }
  await logAction({ telegram }, {
    actionKey: 'action_ban',
    user,
    reason: `${t(`reason.bio_${verdict}`)} ${t('reason.on_join')}`,
    text: '',
  });
}

/** Обработчик апдейта chat_member: реагируем только на вход в чат. */
export async function onChatMember(ctx) {
  const upd = ctx.chatMember;
  if (!upd || upd.chat.id !== config.moderatedChatId) return;
  const wasIn = ['member', 'administrator', 'creator'].includes(upd.old_chat_member.status)
    || (upd.old_chat_member.status === 'restricted' && upd.old_chat_member.is_member);
  const nowIn = upd.new_chat_member.status === 'member'
    || (upd.new_chat_member.status === 'restricted' && upd.new_chat_member.is_member);
  if (wasIn || !nowIn) return;
  await checkJoinedUser(ctx.telegram, upd.new_chat_member.user);
}

/** Обработчик сервисного сообщения new_chat_members (запасной путь). */
export async function onNewChatMembers(ctx) {
  if (ctx.chat?.id !== config.moderatedChatId) return;
  for (const user of ctx.message.new_chat_members ?? []) {
    await checkJoinedUser(ctx.telegram, user);
  }
}
