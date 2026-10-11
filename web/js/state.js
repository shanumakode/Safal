// Shared app state with a minimal subscribe/notify.

export const state = {
  data: null,          // the loaded JSON (Friend 1's output, or MOCK)
  check: null,         // { errors, warnings } from contract.js
  mock: false,         // true => red MOCK banner everywhere
  dataUrl: '',
  lang: 'en',          // 'en' | 'hi'
  reducedMotion: false,
};

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);
export function update(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

// Lookup helpers over the loaded data (pure reads, no calculation).
export function ghatById(id) {
  return state.data?.ghats.find((g) => g.site_id === id) || null;
}
export function sourceById(id) {
  return state.data?.sources?.find((x) => x.source_id === id) || null;
}
export function parameterById(id) {
  return state.data?.parameters?.find((p) => p.parameter_id === id) || null;
}
export function limitFor(id) {
  return state.data?.class_b_limits?.find((l) => l.parameter_id === id) || null;
}
export function readingById(id) {
  for (const g of state.data?.ghats || []) {
    const r = g.readings?.find((x) => x.reading_id === id);
    if (r) return { reading: r, ghat: g };
  }
  return null;
}
