/**
 * Нормализация ID чата/канала к формату Bot API.
 *
 * Супергруппы и каналы в Bot API всегда имеют префикс -100.
 * Принимаем как уже нормализованные значения (-1001096132026),
 * так и "голые" (1096132026) — во втором случае добавляем -100.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null}
 */
export function normalizeChatId(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  const str = String(raw).trim();

  // Уже нормализованный супергруппа/канал.
  if (str.startsWith('-100')) {
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }

  // Личка / старый формат базовой группы (отрицательный без -100) — оставляем как есть.
  if (str.startsWith('-')) {
    const n = Number(str);
    return Number.isFinite(n) ? n : null;
  }

  // "Голый" положительный id супергруппы/канала -> добавляем префикс.
  const n = Number(str);
  if (!Number.isFinite(n)) return null;
  return Number(`-100${n}`);
}

/**
 * Парсит один или несколько id из env (через запятую).
 * Поддерживает несколько имён переменных — все значения объединяются.
 *
 * @param  {...string} envNames
 * @returns {Set<number>}
 */
export function parseChatIdList(...envNames) {
  const ids = new Set();
  for (const name of envNames) {
    const raw = process.env[name];
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const id = normalizeChatId(part.trim());
      if (id !== null) ids.add(id);
    }
  }
  return ids;
}
