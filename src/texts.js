import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { config } from './config.js';
import { logger } from './utils/logger.js';

let texts = {};

/**
 * Загружает (или перезагружает) тексты из lang/ru.yaml.
 */
export function loadTexts() {
  const file = path.join(config.langDir, 'ru.yaml');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    texts = yaml.load(raw) || {};
    logger.info('Тексты загружены из lang/ru.yaml');
  } catch (err) {
    logger.error('Не удалось загрузить lang/ru.yaml:', err.message);
    texts = {};
  }
}

function resolve(key) {
  return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), texts);
}

/**
 * Возвращает текст по ключу с подстановкой плейсхолдеров {var}.
 *
 * @param {string} key  напр. "warn.issued"
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  let str = resolve(key);
  if (typeof str !== 'string') {
    logger.warn(`Текст не найден по ключу: ${key}`);
    return key;
  }
  return str.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
