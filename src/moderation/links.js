import { isBlacklisted, isWhitelisted, normalizeDomain } from './lists.js';

const URL_RE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

function domainFromUrl(url) {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    return normalizeDomain(new URL(withProto).hostname);
  } catch {
    return normalizeDomain(url);
  }
}

/**
 * Извлекает домены ссылок из текста/подписи и entities сообщения.
 *
 * @param {import('telegraf').Context['message']} message
 * @returns {{ domains: string[], hasAnyLink: boolean }}
 */
export function extractLinks(message) {
  const text = message?.text || message?.caption || '';
  const entities = message?.entities || message?.caption_entities || [];
  const domains = new Set();
  let hasAnyLink = false;

  for (const e of entities) {
    if (e.type === 'url') {
      hasAnyLink = true;
      domains.add(domainFromUrl(text.slice(e.offset, e.offset + e.length).trim()));
    } else if (e.type === 'text_link' && e.url) {
      hasAnyLink = true;
      domains.add(domainFromUrl(e.url));
    }
  }

  // Подстраховка: ловим ссылки без entities (например, в подписях/пересланном).
  for (const m of text.matchAll(URL_RE)) {
    hasAnyLink = true;
    domains.add(domainFromUrl(m[1]));
  }

  return { domains: [...domains].filter(Boolean), hasAnyLink };
}

/**
 * Решение по ссылкам.
 *  - Новичок: удаляем при любой ссылке, кроме случая, когда ВСЕ домены в белом списке.
 *  - Остальные: удаляем только при домене из чёрного списка.
 *
 * @returns {{ block: boolean, reason: 'link_newbie'|'link_blacklist'|null, domain: string|null }}
 */
export function checkLinks(message, { isNewbie }) {
  const { domains, hasAnyLink } = extractLinks(message);
  if (!hasAnyLink) return { block: false, reason: null, domain: null };

  const blacklisted = domains.find((d) => isBlacklisted(d));
  if (blacklisted) {
    return { block: true, reason: 'link_blacklist', domain: blacklisted };
  }

  if (isNewbie) {
    const allWhitelisted = domains.length > 0 && domains.every((d) => isWhitelisted(d));
    if (!allWhitelisted) {
      return { block: true, reason: 'link_newbie', domain: domains[0] || null };
    }
  }

  return { block: false, reason: null, domain: null };
}
