import { config } from '../config.js';

function isOwnChat(chatId) {
  if (chatId === null || chatId === undefined) return false;
  return chatId === config.moderatedChatId || config.protectedChannelIds.has(chatId);
}

/**
 * Детектит контент из стороннего канала:
 *  - пересылка поста канала (forward_origin.type === 'channel', legacy forward_from_chat);
 *  - цитата/ответ на сообщение из другого чата (external_reply) — Telegram показывает
 *    её как карточку с названием канала над текстом пользователя;
 *  - история (story) — проверяется отдельно, см. isForeignStory().
 * Свой чат и привязанные каналы (PROTECTED_CHANNEL_ID) не считаются сторонними.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {boolean}
 */
export function isFromForeignChannel(message) {
  if (!message) return false;

  const origin = message.forward_origin;
  if (origin?.type === 'channel' && origin.chat && !isOwnChat(origin.chat.id)) return true;

  const legacy = message.forward_from_chat;
  if (legacy?.type === 'channel' && !isOwnChat(legacy.id)) return true;

  const ext = message.external_reply;
  if (ext) {
    const extChatId = ext.chat?.id ?? ext.origin?.chat?.id;
    if (!isOwnChat(extChatId)) return true;
  }

  return false;
}

/**
 * Пересланная история (story) из чужого чата: канала, группы или личного аккаунта.
 * Истории своего чата и привязанных каналов не считаются чужими.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {boolean}
 */
export function isForeignStory(message) {
  const story = message?.story;
  if (!story) return false;
  return !isOwnChat(story.chat?.id);
}
