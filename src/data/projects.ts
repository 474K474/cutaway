// Каждый проект — пластинка в ящике. Чтобы добавить проект, добавь объект в массив.
// Текст в [квадратных скобках] — плейсхолдер, замени на реальные данные.

export type CoverLayout = 'sun' | 'tall' | 'grid' | 'night';

export interface Sticker {
  text: string;
  bg: string;
  fg: string;
}

export interface Project {
  id: string;
  title: string;
  kind: string;
  year: string;
  /** A — работа и клиенты, B — пет-проекты и учёба */
  side: 'A' | 'B';
  cover: {
    layout: CoverLayout;
    bg: string;
    fg: string;
    accent: string;
    /** Крупное слово на обложке; \n — перенос строки */
    word: string;
    /** Размер слова в процентах от стороны обложки */
    wordSize: number;
    tagline: string;
    sticker?: Sticker;
  };
  tags: string[];
  about: string;
  role: string;
  stack: string[];
  github?: string;
  demo?: string;
}

export const projects: Project[] = [
  {
    id: 'lotos',
    title: 'Лотос',
    kind: 'Сайт-визитка для химчистки',
    year: '2026',
    side: 'A',
    cover: {
      layout: 'sun', bg: '#E0452C', fg: '#141210', accent: '#F2ECE2',
      word: 'Лотос', wordSize: 31, tagline: 'Чистая\nработа.',
      sticker: { text: 'New', bg: '#F2ECE2', fg: '#141210' },
    },
    tags: ['Лендинг', 'Клиентский проект', 'Фронтенд'],
    about: 'Сайт-визитка для химчистки «Лотос»: услуги, цены и контакты на одной странице. [Допиши задачу клиента и результат.]',
    role: '[дизайн, вёрстка, запуск]',
    stack: ['[Стек 1]', '[Стек 2]', '[Стек 3]', '[Хостинг]'],
    github: 'https://github.com/474K474/Lotos-site',
  },
  {
    id: 'vk-teams-bot',
    title: 'VK Teams бот',
    kind: 'Внутренний сервис · Газпром Информ',
    year: '2026',
    side: 'A',
    cover: {
      layout: 'night', bg: '#141210', fg: '#F2ECE2', accent: '#E0452C',
      word: 'Спроси —\nответит', wordSize: 12, tagline: 'Спроси —\nответит.',
      sticker: { text: 'In\nhouse', bg: '#E0452C', fg: '#141210' },
    },
    tags: ['Бот', 'Справочник', 'Корпоративный'],
    about: 'Справочный бот в VK Teams для сотрудников Газпром Информ. [Допиши, какую проблему он решает.]',
    role: '[роль]',
    stack: ['[Стек 1]', '[Стек 2]', 'VK Teams Bot API', '[База данных]'],
  },
  {
    id: 'max-bot',
    title: 'Max бот',
    kind: 'Бот в мессенджере Max',
    year: '[год]',
    side: 'A',
    cover: {
      layout: 'grid', bg: '#7E1A14', fg: '#EDE5D6', accent: '#EDE5D6',
      word: 'Max', wordSize: 22, tagline: 'Напиши\nмне.',
    },
    tags: ['Бот', 'Мессенджер'],
    about: '[Допиши, что делает бот и для кого.]',
    role: '[роль]',
    stack: ['[Стек 1]', '[Стек 2]', 'Max Bot API', '[База данных]'],
  },
  {
    id: 'kod-vremeni',
    title: 'Код времени',
    kind: 'Хакатон',
    year: '[год]',
    side: 'B',
    cover: {
      layout: 'tall', bg: '#EDE5D6', fg: '#141210', accent: '#D2321F',
      word: 'Код\nвре\nмени', wordSize: 25, tagline: 'Хакатон.\nВремя пошло.',
      sticker: { text: 'Limited', bg: '#141210', fg: '#EDE5D6' },
    },
    tags: ['Хакатон', 'Команда', 'Прототип'],
    about: 'Проект с хакатона «Код времени». [Допиши задачу, решение и итог.]',
    role: '[роль в команде]',
    stack: ['[Стек 1]', '[Стек 2]', '[Стек 3]', '[Стек 4]'],
  },
  {
    id: 'bolz',
    title: 'Болз',
    kind: 'Telegram Mini App',
    year: '[год]',
    side: 'B',
    cover: {
      layout: 'sun', bg: '#EE8A2A', fg: '#141210', accent: '#7E1A14',
      word: 'Болз', wordSize: 34, tagline: 'Прямо\nв Telegram.',
    },
    tags: ['Telegram', 'Mini App', 'Фронтенд'],
    about: 'Мини-приложение внутри Telegram. [Допиши суть и аудиторию.]',
    role: '[роль]',
    stack: ['[Стек 1]', '[Стек 2]', 'Telegram WebApp', '[Бэкенд]'],
  },
  {
    id: 'information-theory',
    title: 'Теория информации',
    kind: 'Курсовая · ГУАП',
    year: '2026',
    side: 'B',
    cover: {
      layout: 'tall', bg: '#141210', fg: '#EDE5D6', accent: '#E0452C',
      word: 'Шум\nканал\nкод', wordSize: 21, tagline: 'Шум.\nКанал. Код.',
      sticker: { text: 'Python', bg: '#E0452C', fg: '#141210' },
    },
    tags: ['Python', 'Наука', 'Курсовая'],
    about: 'Экспонента случайного кодирования для общего дискретного канала: расчёты и графики на Python.',
    role: 'автор',
    stack: ['Python', '[Библиотека 1]', '[Библиотека 2]', '[Jupyter?]'],
  },
];

/** Код трека: A1, A2… B1… — по порядку внутри стороны */
export function trackCode(list: Project[], index: number): string {
  const p = list[index];
  const pos = list.slice(0, index + 1).filter((x) => x.side === p.side).length;
  return `${p.side}${pos}`;
}

export const SIDE_NAMES = {
  A: 'Сторона A — работа',
  B: 'Сторона B — пет-проекты',
} as const;
