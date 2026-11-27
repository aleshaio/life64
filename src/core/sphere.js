// Сфера сцены — чистая функция узла. Черты 1–4, 2–5, 3–6 в И-Цзин «соответствуют» друг другу;
// сферу задают нижние черты 1 и 2 и третья пара: s1 = l1 ⊕ c3, s2 = l2 ⊕ c3, где c3 = l3 ⊕ l6.
// Отсчёт ведётся от стартового узла №57: у него сфера «дом».
// Черта 1 переключает бит 1, черта 2 — бит 2, черты 3 и 6 — оба, черты 4 и 5 сферу не меняют.
// В каждой сцене показаны черты 1 и 2, одна из 3/6 и одна из 4/5, поэтому четыре поступка
// всегда ведут в четыре разные сферы: три поворачивают жизнь, один оставляет её в своей стороне.
import { line, START_BITS } from './hexagram.js';

export const SPHERES = ['дом', 'дорога', 'дело', 'близкие'];

const sphereRaw = (bits) => {
  const c3 = line(bits, 3) ^ line(bits, 6);
  return (line(bits, 1) ^ c3) | ((line(bits, 2) ^ c3) << 1);
};
const SPHERE_ORIGIN = sphereRaw(START_BITS);

export function sphere(bits) {
  return sphereRaw(bits) ^ SPHERE_ORIGIN;
}

/** Куда ведёт смена черты из сферы sp. */
export const sphereAfter = (sp, lineNo) => sp ^ [0, 1, 2, 3, 0, 0, 3][lineNo];
