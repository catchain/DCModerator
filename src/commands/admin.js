import { config } from '../config.js';
import { t, loadTexts } from '../texts.js';
import { isAdmin } from '../admins.js';
import { loadLists } from '../moderation/lists.js';
import { getWarnCount, resetWarns } from '../db.js';
import { mention } from '../moderation/actions.js';

function ensureAdmin(ctx) {
  if (ctx.chat?.id !== config.moderatedChatId) {
    ctx.reply(t('common.group_only'));
    return false;
  }
  if (!isAdmin(ctx.from?.id)) {
    ctx.reply(t('common.admins_only'));
    return false;
  }
  return true;
}

/** /reload — перечитать списки и тексты без рестарта. */
export async function reloadCommand(ctx) {
  if (!ensureAdmin(ctx)) return;
  const stats = loadLists();
  loadTexts();
  return ctx.reply(
    t('reload.done', {
      stopwords: stats.stopwords,
      blacklist: stats.blacklist,
      whitelist: stats.whitelist,
    }),
  );
}

/** /warns (reply) — показать число варнов пользователя. */
export async function warnsCommand(ctx) {
  if (!ensureAdmin(ctx)) return;
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply(t('warn.need_reply'));

  const count = getWarnCount(config.moderatedChatId, target.id);
  return ctx.reply(
    t('warn.status', { user: mention(target), count, limit: config.warnLimit }),
    { parse_mode: 'HTML' },
  );
}

/** /unwarn (reply) — снять все варны. */
export async function unwarnCommand(ctx) {
  if (!ensureAdmin(ctx)) return;
  const target = ctx.message.reply_to_message?.from;
  if (!target) return ctx.reply(t('warn.need_reply'));

  resetWarns(config.moderatedChatId, target.id);
  return ctx.reply(t('warn.cleared', { user: mention(target) }), { parse_mode: 'HTML' });
}
