/**
 * Детект inline-кнопок во входящем сообщении.
 *
 * Обычные пользователи физически не могут прикрепить inline-клавиатуру —
 * это умеют только боты/каналы. Поэтому сообщение от юзера с reply_markup
 * почти всегда спам и карается баном.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {boolean}
 */
export function hasInlineButtons(message) {
  const markup = message?.reply_markup;
  if (!markup || !Array.isArray(markup.inline_keyboard)) return false;
  return markup.inline_keyboard.some((row) => Array.isArray(row) && row.length > 0);
}
