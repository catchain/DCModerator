import { config } from '../config.js';
import { t } from '../texts.js';
import { getTop } from '../db.js';
import { mention } from '../moderation/actions.js';

const PERIODS = {
  '1d': { sec: 86400, labelKey: 'top.period_1d' },
  '7d': { sec: 7 * 86400, labelKey: 'top.period_7d' },
  '30d': { sec: 30 * 86400, labelKey: 'top.period_30d' },
};

export async function topCommand(ctx) {
  if (ctx.chat?.id !== config.moderatedChatId) {
    return ctx.reply(t('common.group_only'));
  }

  const arg = (ctx.message.text || '').split(/\s+/)[1]?.toLowerCase();
  const key = arg || config.defaultTopPeriod;
  const period = PERIODS[key];

  if (!period) {
    return ctx.reply(t('top.invalid_period'));
  }

  const rows = getTop(config.moderatedChatId, period.sec, 10);
  if (!rows.length) {
    return ctx.reply(t('top.empty'));
  }

  const lines = rows.map((r, i) =>
    t('top.line', {
      rank: i + 1,
      user: mention({ id: r.user_id, first_name: r.first_name, username: r.username }),
      count: r.cnt,
    }),
  );

  const text = t('top.title', { period: t(period.labelKey) }) + '\n' + lines.join('\n');
  return ctx.reply(text, { parse_mode: 'HTML' });
}
