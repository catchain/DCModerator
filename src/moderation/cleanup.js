import { getDueDeletes, removePendingDelete } from '../db.js';
import { logger } from '../utils/logger.js';

const SWEEP_INTERVAL_MS = 5 * 1000;

/**
 * Удаляет сообщения бота, срок которых наступил (см. scheduleDelete).
 * Очередь хранится в SQLite, поэтому переживает рестарт бота.
 */
async function sweep(bot) {
  for (const { chat_id: chatId, message_id: messageId } of getDueDeletes()) {
    try {
      await bot.telegram.deleteMessage(chatId, messageId);
      removePendingDelete(chatId, messageId);
    } catch (err) {
      // 400: сообщение уже удалено (например, кнопкой в логе) или слишком старое — не повторяем.
      // Прочие ошибки (сеть, 429) — оставляем в очереди до следующего прохода.
      if (err.response?.error_code === 400) {
        removePendingDelete(chatId, messageId);
      } else {
        logger.warn('Не удалось удалить сообщение по таймеру:', err.message);
      }
    }
  }
}

export function startCleanup(bot) {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sweep(bot);
    } catch (err) {
      logger.error('Ошибка очистки сообщений:', err.message);
    } finally {
      running = false;
    }
  }, SWEEP_INTERVAL_MS).unref?.();
}
