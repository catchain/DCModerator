import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config, validateConfig } from './config.js';
import { logger } from './utils/logger.js';
import { loadTexts } from './texts.js';
import { initDb } from './db.js';
import { loadLists } from './moderation/lists.js';
import { refreshAdmins, startAdminRefresh } from './admins.js';
import { initAi } from './moderation/ai.js';
import { moderateMessage } from './moderation/pipeline.js';
import { topCommand } from './commands/top.js';
import { reloadCommand, warnsCommand, unwarnCommand } from './commands/admin.js';
import { warnLogCallback } from './moderation/warnCallbacks.js';

async function deleteServiceMessage(ctx) {
  if (ctx.chat?.id !== config.moderatedChatId) return;
  try {
    await ctx.deleteMessage();
  } catch (err) {
    logger.warn('Не удалось удалить сервисное сообщение:', err.message);
  }
}

async function main() {
  validateConfig();
  loadTexts();
  loadLists();
  initDb();

  const bot = new Telegraf(config.botToken);

  await refreshAdmins(bot);
  startAdminRefresh(bot);
  await initAi();

  // Команды (регистрируем до общего обработчика сообщений).
  bot.command('top', topCommand);
  bot.command('reload', reloadCommand);
  bot.command('warns', warnsCommand);
  bot.command('unwarn', unwarnCommand);

  bot.action(/^w(ban|cancel):\d+:\d+$/, warnLogCallback);

  // Чистка сервисных сообщений (вход/выход участников).
  bot.on(message('new_chat_members'), deleteServiceMessage);
  bot.on(message('left_chat_member'), deleteServiceMessage);

  // Основной конвейер модерации.
  bot.on('message', async (ctx) => {
    try {
      await moderateMessage(ctx);
    } catch (err) {
      logger.error('Ошибка модерации:', err.message);
    }
  });

  bot.catch((err) => logger.error('Telegraf error:', err));

  // bot.launch() резолвится только после остановки бота, поэтому не ждём его здесь.
  bot.launch({ dropPendingUpdates: true }).catch((err) => {
    logger.error('Ошибка polling:', err.message);
    process.exit(1);
  });
  logger.info(`Бот запущен. Модерируемый чат: ${config.moderatedChatId}`);

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  logger.error('Фатальная ошибка запуска:\n' + err.message);
  process.exit(1);
});
