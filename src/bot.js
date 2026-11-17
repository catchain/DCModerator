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
import { startCleanup } from './moderation/cleanup.js';
import { onChatMember, onNewChatMembers } from './moderation/joinBio.js';

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
  startCleanup(bot);

  // Команды (регистрируем до общего обработчика сообщений).
  bot.command('top', topCommand);
  bot.command('reload', reloadCommand);
  bot.command('warns', warnsCommand);
  bot.command('unwarn', unwarnCommand);

  bot.action(/^w(ban|unban|cancel):\d+:\d+$/, warnLogCallback);

  // Вход: удаляем сервисное сообщение и проверяем био (telegra.ph -> бан).
  bot.on(message('new_chat_members'), async (ctx) => {
    await deleteServiceMessage(ctx);
    try {
      await onNewChatMembers(ctx);
    } catch (err) {
      logger.error('Ошибка проверки входа:', err.message);
    }
  });
  bot.on('chat_member', async (ctx) => {
    try {
      await onChatMember(ctx);
    } catch (err) {
      logger.error('Ошибка проверки входа:', err.message);
    }
  });
  bot.on(message('left_chat_member'), deleteServiceMessage);

  // Основной конвейер модерации. Правки проверяем тем же конвейером:
  // спамеры часто отправляют безобидный текст и потом меняют его.
  bot.on(['message', 'edited_message'], async (ctx) => {
    try {
      await moderateMessage(ctx);
    } catch (err) {
      logger.error('Ошибка модерации:', err.message);
    }
  });

  bot.catch((err) => logger.error('Telegraf error:', err));

  // bot.launch() резолвится только после остановки бота, поэтому не ждём его здесь.
  bot.launch({
    dropPendingUpdates: true,
    // chat_member не приходит по умолчанию: без него вход без сервисного сообщения не виден.
    allowedUpdates: ['message', 'edited_message', 'callback_query', 'chat_member'],
  }).catch((err) => {
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
