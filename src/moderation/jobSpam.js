/**
 * Детект спама-вербовки («нужны люди, курьеры, оплата, пишите @...»).
 *
 * Одно подозрительное слово сообщение не блокирует. Правило считает группы признаков
 * и срабатывает только на их сочетание:
 *  - DRUG    — роли наркошопов (закладчик, химик, листовщик, граффитчик...);
 *  - RECRUIT — набор людей (нужны люди, требуются, курьеры, водители, «от 18 лет», «27+»);
 *  - MONEY   — оплата (суммы в $/₽/к, «в неделю», «за рейс», «оплата», «зарплата»);
 *  - CONTACT — призыв написать (@username, t.me/, «пишите», «в лс»).
 *
 * Вердикты:
 *  - 'drug' (бан новичка, иначе удаление + варн): однозначная роль DRUG + CONTACT;
 *    любая роль DRUG + CONTACT + (RECRUIT или MONEY); либо 2+ разных роли DRUG + RECRUIT.
 *    Обычный человек не пишет «химики, листовщики, пишите @...» — это вербовка.
 *  - 'job' (удаление + варн): только у новичков, 2+ признака RECRUIT + MONEY + CONTACT.
 *    Постоянных участников не трогаем: они могут обсуждать работу и зарплаты.
 */

// Латинские буквы-двойники, которыми спамеры обходят фильтры («рaбoтa»).
const HOMOGLYPHS = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м',
  o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};

/** Нижний регистр, ё→е, латинские двойники → кириллица (только внутри кириллических слов). */
export function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[a-zа-я]+/g, (word) =>
      /[а-я]/.test(word) ? word.replace(/[abcehkmoptxy]/g, (ch) => HOMOGLYPHS[ch]) : word,
    );
}

// Кириллические границы слова: \b в JS работает только для латиницы.
const L = '(?<![а-яa-z])';
const R = '(?![а-яa-z])';

// strong — слово почти не встречается вне вербовки; weak — бывает и в обычной речи («я химик»).
const DRUG_ROLES = [
  ['закладчик', true, new RegExp(`${L}закладчик`)],
  ['кладмен', true, new RegExp(`${L}кладм[еа]н`)],
  ['листовщик', true, new RegExp(`${L}листовщик`)],
  ['трафаретчик', true, new RegExp(`${L}трафаретчик`)],
  ['складчик', true, new RegExp(`${L}складчик`)],
  ['химик', false, new RegExp(`${L}химик(и|ов|ам)?${R}`)],
  ['граффитчик', false, new RegExp(`${L}граф+итчик`)],
  ['фасовщик', false, new RegExp(`${L}фасовщик`)],
]

const RECRUIT = [
  new RegExp(`${L}нужн[ыа] (люди|ребята|сотрудники|работники|курьеры|водители)`),
  new RegExp(`${L}требу(ю|е)тся${R}`),
  new RegExp(`${L}(ищем|ищу|набираем|набираю) (людей|сотрудников|курьеров|водителей|ребят|в команду)`),
  new RegExp(`${L}набор (в команду|сотрудников|курьеров|людей)`),
  new RegExp(`${L}ваканси[яи]${R}`),
  new RegExp(`${L}подработк`),
  new RegExp(`${L}(удаленн|онлайн|легк|прост|дополнительн)[а-я]* (работ|заработ|подработ)`),
  new RegExp(`${L}(есть|предлагаю|предлагаем|даю|дам) (работу|работа|заработок)`),
  new RegExp(`${L}(курьер|водител|перевозчик|грузчик|разносчик|промоутер)`),
  new RegExp(`${L}от \\d{2} ?(лет|год|\\+)`),
  new RegExp(`(?<!\\d)\\d{2} ?\\+`),
];

const MONEY = [
  new RegExp(`\\d[\\d\\s.,]*\\s?(к|k|тыс|млн)?\\s?(\\$|€|₽|usd|usdt|долл|руб|бакс)`),
  new RegExp(`(\\$|€|₽)\\s?\\d`),
  new RegExp(`\\d+\\s?(тыс|млн)`),
  new RegExp(`${L}(в|за) (день|сутки|неделю|месяц|рейс|смену|час|ходку)${R}`),
  new RegExp(`${L}(оплата|зарплат|зп${R}|доход|выплат|заработок от)`),
];

const CONTACT = [
  /(^|[^a-z0-9_])@[a-z][a-z0-9_]{4,}/,
  /t\.me\//,
  new RegExp(`${L}(пишите|пиши|писать|напишите|обращайтесь|отпишите|стучите)${R}`),
  new RegExp(`${L}(в лс|в личку|в личные|в директ)${R}`),
];

function hasMentionEntity(message) {
  const entities = message?.entities || message?.caption_entities || [];
  return entities.some((e) => e.type === 'mention' || e.type === 'text_mention');
}

/**
 * @param {import('telegraf').Context['message']} message
 * @param {{ isNewbie: boolean }} opts
 * @returns {{ verdict: 'drug'|'job'|null, signals: string[] }}
 */
export function checkJobSpam(message, { isNewbie }) {
  const raw = message?.text || message?.caption || '';
  if (!raw) return { verdict: null, signals: [] };
  const text = normalizeText(raw);

  const matched = DRUG_ROLES.filter(([, , re]) => re.test(text));
  const roles = matched.map(([name]) => name);
  const strongRole = matched.some(([, strong]) => strong);
  const recruitHits = RECRUIT.filter((re) => re.test(text)).length;
  const recruit = recruitHits > 0;
  const money = MONEY.some((re) => re.test(text));
  const contact = hasMentionEntity(message) || CONTACT.some((re) => re.test(text));

  const signals = [
    ...roles.map((r) => `drug:${r}`),
    recruit && `recruit:${recruitHits}`,
    money && 'money',
    contact && 'contact',
  ].filter(Boolean);

  if (strongRole && contact) return { verdict: 'drug', signals };
  if (roles.length > 0 && contact && (recruit || money)) return { verdict: 'drug', signals };
  if (roles.length >= 2 && recruit) return { verdict: 'drug', signals };
  if (isNewbie && recruitHits >= 2 && money && contact) return { verdict: 'job', signals };
  return { verdict: null, signals };
}
