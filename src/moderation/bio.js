import { logger } from '../utils/logger.js';

/**
 * Проверка био (описания профиля) автора сообщения.
 *  - ссылка на telegra.ph (или его зеркало graph.org) -> 'telegraph' (удаление + бан);
 *  - зачёркивающие комбинируемые символы (U+0334–U+0338) -> 'strike' (удаление + бан);
 *  - любая другая ссылка -> 'link' (только удаление).
 *
 * Био запрашивается через getChat(userId) и кэшируется, чтобы не дёргать API на каждое сообщение.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 5000;

/** @type {Map<number, { bio: string, at: number }>} */
const cache = new Map();
/** @type {Map<number, Promise<string>>} */
const inFlight = new Map();

// Кириллические двойники латинских букв: спамеры пишут «tеlеgrа.рh» кириллицей.
const HOMOGLYPHS = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c',
  т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ԁ: 'd', ӏ: 'l', г: 'r', п: 'n', ь: 'b',
};

/** NFKC + удаление комбинируемых знаков (зачёркивание U+0336 и т.п.) и невидимых символов. */
export function cleanText(s = '') {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[​-‏⁠﻿­]/g, '')
    .normalize('NFKC')
    .toLowerCase();
}

function latinize(s) {
  return s.replace(/[а-яёіјԁӏ]/g, (ch) => HOMOGLYPHS[ch] ?? ch);
}

const TELEGRAPH_RE = /telegra\s*[.,·。]\s*ph|telegraph\s*[.,·。]\s*ph|(?:^|[^a-z0-9])graph\s*[.,·。]\s*org/;

/** Ссылка на telegra.ph / graph.org, в том числе замаскированная. */
export function hasTelegraphLink(bio) {
  return TELEGRAPH_RE.test(latinize(cleanText(bio)));
}

// Частые TLD: без схемы/www/пути считаем ссылкой только их, чтобы не ловить «Node.js».
const COMMON_TLDS = new Set([
  'com', 'net', 'org', 'ru', 'su', 'io', 'me', 'ph', 'xyz', 'site', 'online', 'top', 'link',
  'club', 'info', 'biz', 'pro', 'app', 'dev', 'ly', 'cc', 'to', 'gg', 'co', 'tv', 'live',
  'shop', 'store', 'fun', 'space', 'website', 'icu', 'vip', 'win', 'bet', 'cam', 'click',
  'kz', 'ua', 'by', 'uz', 'de', 'uk', 'us', 'eu', 'ai', 'tk', 'ml', 'ga', 'cf', 'gq', 'ws',
  'in', 'cn', 'pw', 'mobi', 'one', 'world', 'today', 'lol', 'sbs', 'cfd', 'rest', 'bond',
]);

const URL_RE = /(https?:\/\/)?((?:[a-z0-9-]+\.)+([a-z]{2,}))(\/\S*)?/g;

/** Любая ссылка в био (http(s)://, www., домен с путём или с частым TLD, t.me/...). */
export function hasAnyLink(bio) {
  const text = cleanText(bio);
  for (const m of text.matchAll(URL_RE)) {
    const [, scheme, host, tld, pathPart] = m;
    if (scheme || pathPart || host.startsWith('www.') || COMMON_TLDS.has(tld)) return true;
  }
  return false;
}

// Наложенные знаки: тильда, короткая/длинная черта, короткий/длинный слэш поверх буквы.
// Обычный человек их не набирает, спамеры так ломают фильтры («з̶д̶е̶с̶ь̶»).
const STRIKE_RE = /[\u0334-\u0338]/;

export function hasStrikeChars(bio) {
  return STRIKE_RE.test(bio);
}

/** Вердикты, за которые бан. */
export const BAN_VERDICTS = new Set(['telegraph', 'strike']);

/**
 * @returns {'telegraph' | 'strike' | 'link' | null}
 */
export function classifyBio(bio) {
  if (!bio) return null;
  if (hasTelegraphLink(bio)) return 'telegraph';
  if (hasStrikeChars(bio)) return 'strike';
  if (hasAnyLink(bio)) return 'link';
  return null;
}

async function fetchBio(telegram, userId) {
  try {
    const chat = await telegram.getChat(userId);
    return chat?.bio || '';
  } catch (err) {
    logger.warn(`Не удалось получить био ${userId}:`, err.message);
    return '';
  }
}

/** Био пользователя с кэшем на CACHE_TTL_MS. При ошибке API — пустая строка. */
export async function getBio(telegram, userId) {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.bio;

  let pending = inFlight.get(userId);
  if (!pending) {
    pending = fetchBio(telegram, userId).finally(() => inFlight.delete(userId));
    inFlight.set(userId, pending);
  }
  const bio = await pending;

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(userId, { bio, at: Date.now() });
  return bio;
}

/**
 * Проверяет био автора. Возвращает вердикт и само био (для лога).
 * @returns {Promise<{ verdict: 'telegraph' | 'strike' | 'link' | null, bio: string }>}
 */
export async function checkBio(telegram, userId) {
  const bio = await getBio(telegram, userId);
  return { verdict: classifyBio(bio), bio };
}
