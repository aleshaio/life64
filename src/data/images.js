// Иллюстрации 1.0. Сначала нарисованы герой и героиня в шести возрастах (6, 12, 20, 35, 52, 75), потом каждая сцена
// по портрету нужного возраста: лицо одно, но взрослеет. В 0.5 всё рисовалось в Higgsfield (gpt_image_2_5 flare,
// старые id заданий — art/v05/files.json), в 1.0 портреты и все 128 сцен перерисованы в ChatGPT (как — art/v10/README.md).
// Ключ сцены: пол + эпизод + сфера, например «F7-2». Каждая картинка лежит только в репозитории: dist/img/v5-<ключ>.jpg
// (LOCAL), оригиналов по ссылке больше нет. Префикс v5- остался от 0.5, по нему fetch-art отличал их от картинок 0.4.
export const IMG_BASE = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EWrDYgOZatxK48XvCVwdjulHAS/';
const ART_PREFIX = 'v5-';
export const LOCAL = 'local';
export const SCENE_ART = {
  'M1-0': LOCAL,
  'M1-1': LOCAL,
  'M1-2': LOCAL,
  'M1-3': LOCAL,
  'M2-0': LOCAL,
  'M2-1': LOCAL,
  'M2-2': LOCAL,
  'M2-3': LOCAL,
  'M3-0': LOCAL,
  'M3-1': LOCAL,
  'M3-2': LOCAL,
  'M3-3': LOCAL,
  'M4-0': LOCAL,
  'M4-1': LOCAL,
  'M4-2': LOCAL,
  'M4-3': LOCAL,
  'M5-0': LOCAL,
  'M5-1': LOCAL,
  'M5-2': LOCAL,
  'M5-3': LOCAL,
  'M6-0': LOCAL,
  'M6-1': LOCAL,
  'M6-2': LOCAL,
  'M6-3': LOCAL,
  'M7-0': LOCAL,
  'M7-1': LOCAL,
  'M7-2': LOCAL,
  'M7-3': LOCAL,
  'M8-0': LOCAL,
  'M8-1': LOCAL,
  'M8-2': LOCAL,
  'M8-3': LOCAL,
  'M9-0': LOCAL,
  'M9-1': LOCAL,
  'M9-2': LOCAL,
  'M9-3': LOCAL,
  'M10-0': LOCAL,
  'M10-1': LOCAL,
  'M10-2': LOCAL,
  'M10-3': LOCAL,
  'M11-0': LOCAL,
  'M11-1': LOCAL,
  'M11-2': LOCAL,
  'M11-3': LOCAL,
  'M12-0': LOCAL,
  'M12-1': LOCAL,
  'M12-2': LOCAL,
  'M12-3': LOCAL,
  'M13-0': LOCAL,
  'M13-1': LOCAL,
  'M13-2': LOCAL,
  'M13-3': LOCAL,
  'M14-0': LOCAL,
  'M14-1': LOCAL,
  'M14-2': LOCAL,
  'M14-3': LOCAL,
  'M15-0': LOCAL,
  'M15-1': LOCAL,
  'M15-2': LOCAL,
  'M15-3': LOCAL,
  'M16-0': LOCAL,
  'M16-1': LOCAL,
  'M16-2': LOCAL,
  'M16-3': LOCAL,
  'F1-0': LOCAL,
  'F1-1': LOCAL,
  'F1-2': LOCAL,
  'F1-3': LOCAL,
  'F2-0': LOCAL,
  'F2-1': LOCAL,
  'F2-2': LOCAL,
  'F2-3': LOCAL,
  'F3-0': LOCAL,
  'F3-1': LOCAL,
  'F3-2': LOCAL,
  'F3-3': LOCAL,
  'F4-0': LOCAL,
  'F4-1': LOCAL,
  'F4-2': LOCAL,
  'F4-3': LOCAL,
  'F5-0': LOCAL,
  'F5-1': LOCAL,
  'F5-2': LOCAL,
  'F5-3': LOCAL,
  'F6-0': LOCAL,
  'F6-1': LOCAL,
  'F6-2': LOCAL,
  'F6-3': LOCAL,
  'F7-0': LOCAL,
  'F7-1': LOCAL,
  'F7-2': LOCAL,
  'F7-3': LOCAL,
  'F8-0': LOCAL,
  'F8-1': LOCAL,
  'F8-2': LOCAL,
  'F8-3': LOCAL,
  'F9-0': LOCAL,
  'F9-1': LOCAL,
  'F9-2': LOCAL,
  'F9-3': LOCAL,
  'F10-0': LOCAL,
  'F10-1': LOCAL,
  'F10-2': LOCAL,
  'F10-3': LOCAL,
  'F11-0': LOCAL,
  'F11-1': LOCAL,
  'F11-2': LOCAL,
  'F11-3': LOCAL,
  'F12-0': LOCAL,
  'F12-1': LOCAL,
  'F12-2': LOCAL,
  'F12-3': LOCAL,
  'F13-0': LOCAL,
  'F13-1': LOCAL,
  'F13-2': LOCAL,
  'F13-3': LOCAL,
  'F14-0': LOCAL,
  'F14-1': LOCAL,
  'F14-2': LOCAL,
  'F14-3': LOCAL,
  'F15-0': LOCAL,
  'F15-1': LOCAL,
  'F15-2': LOCAL,
  'F15-3': LOCAL,
  'F16-0': LOCAL,
  'F16-1': LOCAL,
  'F16-2': LOCAL,
  'F16-3': LOCAL,
};
/** Портреты по возрастам. Шесть из 1.0 (6, 12, 20, 35, 52, 75): по ним рисовались сцены, они на карточке типа.
 *  В 1.1 к ним дорисованы все возрасты эпизодов, от 10 до 84: лицо в табло взрослеет каждый ход. */
const FACES = {
  M: [6, 10, 12, 14, 17, 20, 23, 28, 35, 39, 46, 51, 52, 55, 59, 65, 71, 75, 78, 84],
  F: [6, 10, 12, 14, 17, 20, 23, 28, 35, 39, 46, 51, 52, 55, 59, 65, 71, 75, 78, 84],
};
export const AGE_ART = { M: Object.fromEntries(FACES.M.map((a) => [a, LOCAL])), F: Object.fromEntries(FACES.F.map((a) => [a, LOCAL])) };
export const PORTRAIT_AGES = [6, 12, 20, 35, 52, 75];
/** Есть ли портрет ровно этого возраста. */
export const hasFace = (sex, age) => Boolean(AGE_ART[sex] && AGE_ART[sex][age]);
const artPic = (name, id) => ({ local: `img/${ART_PREFIX}${name}.jpg`, remote: id && id !== LOCAL ? `${IMG_BASE}${id}.png` : null });
/** { local, remote } для сцены или null, если ключа нет. */
export function imageFor(key) {
  if (!key) return null;
  const pic = artPic(key, SCENE_ART[key]);
  // 1.1: WebP 1024 px и чёткая 1524 px для больших и плотных экранов; JPEG остаётся запасным src.
  pic.set = `img/${ART_PREFIX}${key}.webp 1024w, img/hd/${ART_PREFIX}${key}.webp 1524w`;
  return pic;
}
/** Портрет героя в данном возрасте; WebP 160 px для табло, 410 px для ленты лиц, 819 px для крупных, JPEG запасной. */
export const ageFor = (sex, age) => ({ ...artPic(`age-${sex}-${age}`, AGE_ART[sex][age]), set: `img/xs/${ART_PREFIX}age-${sex}-${age}.webp 160w, img/sm/${ART_PREFIX}age-${sex}-${age}.webp 410w, img/${ART_PREFIX}age-${sex}-${age}.webp 819w` });
export const portraitFor = (sex) => ageFor(sex, 6);
/** Картина главы жизни (1–4: весна, лето, осень, зима) и обложка стартового экрана. Их дорисовывают:
 *  пока файла нет, глава открывается одним заголовком, а старт — как раньше, без обложки. */
// Картины глав и обложка: WebP 1024 px и 1536 px для плотных экранов, JPEG 1536 px — запасной src.
const paintingSet = (name) => `img/${name}.webp 1024w, img/hd/${name}.webp 1536w`;
// Где на картине лица (доля высоты для object-position): широкая рамка режет низ, а не головы.
const FOCUS = { 'act-M-3': 2, 'act-F-3': 6, 'act-F-4': 10, 'end-M': 22, 'end-F': 2 };
const focusOf = (name) => FOCUS[name] ?? 12;
export const chapterArt = (sex, n) => ({ local: `img/${ART_PREFIX}act-${sex}-${n}.jpg`, set: paintingSet(`${ART_PREFIX}act-${sex}-${n}`), focus: focusOf(`act-${sex}-${n}`), remote: null });
export const COVER_ART = { local: 'img/cover.jpg', set: paintingSet('cover'), remote: null };
/** Картины типов жизни (1.1): символическая сцена на тип, без лица героя, одна на него и на неё. Ключ — стихия и роль, например earth-IS.
 *  В списке только уже нарисованные: для остальных картины в карте типа нет. */
export const TYPE_ART = new Set(['air-EN', 'air-IN', 'air-IS', 'air-ES', 'fire-EN', 'fire-IN', 'fire-IS', 'fire-ES', 'water-EN', 'water-IN', 'water-IS', 'water-ES', 'earth-EN', 'earth-IN', 'earth-IS', 'earth-ES']);
export const typeArt = (quad, role) => (TYPE_ART.has(`${quad}-${role}`) ? { local: `img/type-${quad}-${role}.jpg`, set: paintingSet(`type-${quad}-${role}`), remote: null } : null);
/** Те же картины маленькими для стола «Шестнадцать жизней» в финале: WebP 400 px, 1024 px для плотных экранов, JPEG запасной. */
export const typeThumb = (quad, role) => (TYPE_ART.has(`${quad}-${role}`) ? { local: `img/type-${quad}-${role}.jpg`, set: `img/sm/type-${quad}-${role}.webp 400w, img/type-${quad}-${role}.webp 1024w`, remote: null } : null);
/** Эпилог: герой в старости, каким его запомнили (поздняя осень у него, ранняя весна у неё). */
export const endArt = (sex) => ({ local: `img/${ART_PREFIX}end-${sex}.jpg`, set: paintingSet(`${ART_PREFIX}end-${sex}`), focus: focusOf(`end-${sex}`), remote: null });
/** Картинки для скачивания: [локальное имя без .jpg, id на сервере]. Локальные (LOCAL) скачивать неоткуда; в 1.0 это все. */
export const ART_FILES = [
  ...Object.entries(SCENE_ART).map(([key, id]) => [`${ART_PREFIX}${key}`, id]),
  ...['M', 'F'].flatMap((sex) => PORTRAIT_AGES.map((a) => [`${ART_PREFIX}age-${sex}-${a}`, AGE_ART[sex][a]])),
].filter(([, id]) => id !== LOCAL);
