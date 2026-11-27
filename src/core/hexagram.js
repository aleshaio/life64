// Шесть черт — единый источник истины. bits: число 0..63, бит i — черта i+1 (снизу вверх), 1 = Ян.
// x = 4*l1 + 2*l2 + l3 (нижняя триграмма), y = 4*l4 + 2*l5 + l6 (верхняя).

export const TRIGRAMS = ['Земля', 'Гора', 'Вода', 'Ветер', 'Гром', 'Огонь', 'Озеро', 'Небо'];

// KING_WEN[y][x]: y — верхняя триграмма, x — нижняя.
export const KING_WEN = [
  [2, 15, 7, 46, 24, 36, 19, 11],
  [23, 52, 4, 18, 27, 22, 41, 26],
  [8, 39, 29, 48, 3, 63, 60, 5],
  [20, 53, 59, 57, 42, 37, 61, 9],
  [16, 62, 40, 32, 51, 55, 54, 34],
  [35, 56, 64, 50, 21, 30, 38, 14],
  [45, 31, 47, 28, 17, 49, 58, 43],
  [12, 33, 6, 44, 25, 13, 10, 1],
];

export const line = (bits, n) => (bits >> (n - 1)) & 1;

export function coords(bits) {
  const x = 4 * line(bits, 1) + 2 * line(bits, 2) + line(bits, 3);
  const y = 4 * line(bits, 4) + 2 * line(bits, 5) + line(bits, 6);
  return { x, y };
}

export function bitsFromCoords(x, y) {
  const l = [(x >> 2) & 1, (x >> 1) & 1, x & 1, (y >> 2) & 1, (y >> 1) & 1, y & 1];
  return l.reduce((acc, v, i) => acc | (v << i), 0);
}

export const hexNumber = (bits) => {
  const { x, y } = coords(bits);
  return KING_WEN[y][x];
};

const BITS_BY_N = {};
for (let b = 0; b < 64; b++) BITS_BY_N[hexNumber(b)] = b;
export const bitsOf = (n) => BITS_BY_N[n];

/** Ровно одна инверсия черты 1..6. */
export function flip(bits, lineNo) {
  if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > 6) throw new Error(`bad line ${lineNo}`);
  return bits ^ (1 << (lineNo - 1));
}

export const neighbours = (bits) => [1, 2, 3, 4, 5, 6].map((l) => flip(bits, l));

export const popcount = (v) => { let c = 0; while (v) { c += v & 1; v >>= 1; } return c; };

/** Черты снизу вверх строкой, например «011011». */
export const bitString = (bits) => [1, 2, 3, 4, 5, 6].map((l) => line(bits, l)).join('');

/** Символ гексаграммы для отладки и расшифровки: сверху вниз. */
export const glyph = (bits) => [6, 5, 4, 3, 2, 1].map((l) => (line(bits, l) ? '━━━━━' : '━━ ━━')).join('\n');

export const START_BITS = bitsFromCoords(3, 3); // №57, 011011
