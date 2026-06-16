import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const state = {
  stopwords: [],
  blacklist: new Set(),
  whitelist: new Set(),
};

function readLines(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch (err) {
    logger.warn(`Не удалось прочитать ${path.basename(file)}: ${err.message}`);
    return [];
  }
}

function normalizeDomain(d) {
  return d
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Загружает (перезагружает) все списки из data/*.txt.
 */
export function loadLists() {
  state.stopwords = readLines(path.join(config.dataDir, 'stopwords.txt')).map((w) => w.toLowerCase());
  state.blacklist = new Set(readLines(path.join(config.dataDir, 'links-blacklist.txt')).map(normalizeDomain));
  state.whitelist = new Set(readLines(path.join(config.dataDir, 'links-whitelist.txt')).map(normalizeDomain));

  logger.info(
    `Списки загружены: стоп-слов ${state.stopwords.length}, ` +
      `чёрный ${state.blacklist.size}, белый ${state.whitelist.size}`,
  );

  return {
    stopwords: state.stopwords.length,
    blacklist: state.blacklist.size,
    whitelist: state.whitelist.size,
  };
}

export function getStopwords() {
  return state.stopwords;
}

export function isWhitelisted(domain) {
  return state.whitelist.has(normalizeDomain(domain));
}

export function isBlacklisted(domain) {
  return state.blacklist.has(normalizeDomain(domain));
}

export { normalizeDomain };
