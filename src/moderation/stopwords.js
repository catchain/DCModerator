import { getStopwords } from './lists.js';

/**
 * Возвращает первое найденное стоп-слово или null.
 * Сопоставление по подстроке (без учёта регистра).
 *
 * @param {string} text
 * @returns {string|null}
 */
export function findStopword(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const word of getStopwords()) {
    if (lower.includes(word)) return word;
  }
  return null;
}
