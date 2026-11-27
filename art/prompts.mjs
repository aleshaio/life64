// Промпты иллюстраций: 16 эпизодов × 2 героя. Референсы — портреты героя и героини в 30 лет.
export const STYLE = 'Cinematic realistic painting, muted cold palette of a Russian provincial river city, natural overcast light, quiet serious film-still mood, natural proportions, one moment in time. No text, no letters, no logos, no UI, no symbols, no frames.';
export const HERO = {
  M: (age) => age < 18
    ? `the same person as the reference portrait but as a ${age}-year-old boy: dark-blond hair, grey eyes`
    : age < 60
      ? `the same man as the reference portrait at age ${age}: dark-blond hair${age > 45 ? ' with grey at the temples' : ''}, grey eyes, thin pale scar through the left eyebrow`
      : `the same man as the reference portrait at age ${age}: ${age > 75 ? 'white thinning hair, deeply lined face' : 'grey hair, lined face'}, grey eyes, thin pale scar through the left eyebrow`,
  F: (age) => age < 18
    ? `the same person as the reference portrait but as a ${age}-year-old girl: chestnut hair, grey-green eyes`
    : age < 60
      ? `the same woman as the reference portrait at age ${age}: chestnut hair${age > 45 ? ' with first grey strands' : ''}, grey-green eyes, small mole above the right corner of the upper lip`
      : `the same woman as the reference portrait at age ${age}: ${age > 75 ? 'white hair in a low bun, deeply lined face' : 'grey hair, lined face'}, grey-green eyes, small mole above the upper lip`,
};
export const SCENES = [
  [6, 'stands at the window of a seventh-floor flat in a Soviet panel building at dusk, palms on the glass; across the wide river a steel bridge with truck lights; behind, a tired mother in a nurse uniform buttons her coat'],
  [10, 'in a cramped school robotics club room, watching sparks from a worn-out old soldering station in the corner; a strict woman teacher in her fifties with glasses stands at the blackboard, unaware'],
  [14, 'in an empty school corridor beside a same-age best friend who looks accused and frightened; at the far end a stern vice-principal holds a phone; winter light through tall windows'],
  [17, 'on a railway platform at dawn with a backpack, looking back at the river city; the mother stands a little apart, arms crossed against the cold'],
  [23, 'in a small cluttered electronics repair workshop under a bridge, receiving a ring of old keys from an elderly woman, the former teacher'],
  [28, 'at a plain office table late in the evening, a contract and engineering drawings of a steel bridge in front, pen hovering; a partner in a suit blurred in the doorway'],
  [35, 'alone at night in a half-empty warehouse lit by one lamp, empty shelves, a phone screen glowing in hand, exhausted'],
  [39, 'standing at the glass wall of a high Moscow office with a travel bag, city lights below, reflection of a small river town overlaid faintly in the glass'],
  [46, 'sitting on a bench in a hospital corridor at night, elbows on knees; through an open door a young woman of nineteen with a bandaged arm sleeps'],
  [51, 'on a flooded spring embankment in front of the old bridge closed with red-and-white barriers and construction fences, rain, hands in pockets'],
  [55, 'in a city council hall, standing alone before a long table of officials; a large map with a new road drawn across an old neighbourhood'],
  [59, 'rolling up sleeves in a tiny new office with bare walls near a new cable-stayed bridge, a few boxes, morning light'],
  [65, 'in an emptied parents\' flat among cardboard boxes, holding an old family photograph, sunlight on dust'],
  [71, 'in a workshop handing an old handwritten notebook and a ring of keys to a young engineer in their late twenties; hands in focus'],
  [78, 'with an old friend of the same age at a kitchen window with two cups of tea, both silent, the river outside in late afternoon'],
  [84, 'sitting alone on a bench on the river embankment at autumn dusk, coat and scarf, looking at the water and the distant bridge'],
];
export function prompt(sex, i) {
  const [age, scene] = SCENES[i];
  return `${STYLE} Episode of a human life: ${HERO[sex](age)}, ${scene}. Keep the face clearly recognisable as the same person from the reference, aged appropriately.`;
}
