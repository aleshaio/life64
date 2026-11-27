import { LIFE } from '../../src/data/life.js';
import { SCENES } from './scenes.mjs';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
const REF = JSON.parse(readFileSync(new URL('./refjobs.json', import.meta.url)));
const WORD = { 6: 'six', 10: 'ten', 14: 'fourteen', 17: 'seventeen', 23: 'twenty-three', 28: 'twenty-eight', 35: 'thirty-five', 39: 'thirty-nine', 46: 'forty-six', 51: 'fifty-one', 55: 'fifty-five', 59: 'fifty-nine', 65: 'sixty-five', 71: 'seventy-one', 78: 'seventy-eight', 84: 'eighty-four' };
const band = (a) => (a <= 6 ? 6 : a <= 14 ? 12 : a <= 23 ? 20 : a <= 39 ? 35 : a <= 59 ? 52 : 75);
const noun = (sex, a) => (a <= 14 ? (sex === 'M' ? 'boy' : 'girl') : a <= 23 ? (sex === 'M' ? 'young man' : a <= 17 ? 'girl' : 'young woman') : (sex === 'M' ? 'man' : 'woman'));
const short = (sex, a) => (a >= 65 ? (sex === 'M' ? 'old man' : 'old woman') : noun(sex, a));
const NOTE = {
  6: 'a small six-year-old child with a real child\'s face: round soft cheeks, a small nose, big eyes',
  10: 'ten years old: a real child with a round childish face, a little younger and smaller than in the reference',
  14: 'fourteen: a lanky young teenager, a little older than in the reference, still a childlike face, no stubble, no make-up',
  17: 'seventeen: a youthful fresh face, a little younger than in the reference',
  23: 'twenty-three: young, as in the reference or a little older',
  28: 'twenty-eight: a little younger than in the reference, almost no lines on the face',
  35: 'thirty-five, as in the reference',
  39: 'thirty-nine: a little older than in the reference, the first fine lines around the eyes',
  46: 'forty-six: a little younger than in the reference, hair only beginning to grey at the temples',
  51: 'fifty-one, as in the reference, greying hair',
  55: 'fifty-five: a little older than in the reference, more grey in the hair',
  59: 'fifty-nine: mostly grey hair, deeper wrinkles than in the reference',
  65: 'sixty-five: clearly younger than in the reference, grey rather than white hair, still strong and upright',
  71: 'seventy-one: white-haired, a little younger than in the reference',
  78: 'seventy-eight, as in the reference or a little older',
  84: 'eighty-four: older and frailer than in the reference, thin white hair, deep wrinkles',
};
export const STYLE = 'Warm, bright, life-affirming painterly graphic-novel illustration in the same style as the reference portrait: soft golden sunlight or warm lamplight, an airy bright palette (sunlit ochre, warm peach, teal, fresh greens, sky blue). Expressive faces show the true emotion of this moment (worry, tenderness, hope, resolve), never gloomy; warmth and human closeness even in a hard moment. Contemporary Russia unless the scene says otherwise. Cinematic wide shot, the main character clearly visible with the same face as in the reference. No dark or grey palette, no horror, no blood. No text, no letters, no captions.';
const out = [];
for (const sex of ['M', 'F']) for (const e of LIFE[sex]) for (const sp of Object.keys(e.s)) {
  const key = `${sex}${e.n}-${sp}`; const d = SCENES[key];
  if (!d) throw new Error(`нет описания ${key}`);
  const a = e.age; const n = noun(sex, a); const pro = sex === 'M' ? 'He' : 'She';
  let first = true;
  const desc = d.replace(/\{H\}('s)?/g, (m, poss) => {
    const s = first ? `the ${WORD[a]}-year-old ${n} from the reference image` : `the ${short(sex, a)}`;
    first = false; return s + (poss || '');
  });
  const body = (desc.charAt(0).toUpperCase() + desc.slice(1)).replace(/([.!?] )the /g, '$1The ');
  const ref = REF[sex][band(a)];
  out.push({ key, sex, age: a, band: band(a), ref, prompt: `${body}. The ${short(sex, a)} is the same person as in the reference image, here ${NOTE[a]}. ${STYLE}` });
}
const extra = Object.keys(SCENES).filter((k) => !out.some((o) => o.key === k));
if (extra.length) throw new Error(`лишние описания: ${extra}`);
writeFileSync(new URL('./scene_prompts.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, 'prompts;', out.filter((o) => !o.ref).length, 'without ref yet');
