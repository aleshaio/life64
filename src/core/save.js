// Сохранение: журнал решений + снимок + контрольная сумма. При загрузке история воспроизводится заново.
import { newGame, applyChoice, acknowledge, SCHEMA_VERSION } from './engine.js';

export const SAVE_KEY = 'prozhit-zhizn:v3';

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const journalOf = (state) => state.journal.map((j) => ({ episode: j.episode, choiceId: j.choiceId, line: j.line, from: j.from, to: j.to }));

export function serialize(state) {
  const body = {
    schemaVersion: SCHEMA_VERSION, sex: state.sex, initialBits: state.initialBits,
    journal: journalOf(state), acked: state.acked,
    snapshot: { bits: state.bits, episode: state.episode },
  };
  return JSON.stringify({ ...body, checksum: fnv1a(JSON.stringify(body)) });
}

/** Возвращает восстановленное состояние или null, если сохранение повреждено. Ложную биографию не показываем. */
export function deserialize(text) {
  try {
    const data = JSON.parse(text);
    const { checksum, ...body } = data;
    if (data.schemaVersion !== SCHEMA_VERSION) return null;
    if (fnv1a(JSON.stringify(body)) !== checksum) return null;
    if (body.sex !== 'M' && body.sex !== 'F') return null;
    let s = newGame(body.sex);
    if (body.initialBits !== s.initialBits) return null;
    for (const j of body.journal) {
      if (j.episode !== s.episode || j.from !== s.bits) return null;
      s = acknowledge(applyChoice(s, j.choiceId));
      if (s.bits !== j.to) return null;
    }
    if (s.bits !== body.snapshot.bits || s.episode !== body.snapshot.episode) return null;
    const acked = body.acked;
    if (!(acked === s.journal.length || acked === s.journal.length - 1)) return null;
    return { ...s, acked };
  } catch {
    return null;
  }
}

/** Обёртка над localStorage; любые ошибки хранилища не ломают игру. */
export const storage = {
  load(ls) {
    try { const t = ls.getItem(SAVE_KEY); return t ? deserialize(t) : null; } catch { return null; }
  },
  save(ls, state) {
    try { ls.setItem(SAVE_KEY, serialize(state)); return true; } catch { return false; }
  },
  clear(ls) {
    try { ls.removeItem(SAVE_KEY); } catch { /* ignore */ }
  },
  exists(ls) {
    try { return !!ls.getItem(SAVE_KEY); } catch { return false; }
  },
};
