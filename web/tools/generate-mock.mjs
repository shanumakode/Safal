// Generates web/data/ghat_scores.mock.json — FAKE data for UI development only.
//
// Nothing in this file is a real result. Ghat names, values, ranks, scores,
// verdicts and counts are invented so every edge case of the draft contract
// (docs/CONTRACT.md) can be seen on screen. Real scoring belongs to Friend 1's
// module; this script is NOT a scoring implementation and must never be used
// as one.
//
// Run from the repo root:  node web/tools/generate-mock.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'ghat_scores.mock.json');

// Deterministic PRNG so the mock file is stable between runs.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261020);
const jitter = (base, spread) => base + (rand() * 2 - 1) * spread;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

const PARAMETERS = [
  { parameter_id: 'ph', name_en: 'pH', name_hi: 'pH', unit_assumed: null, has_class_b_limit: true },
  { parameter_id: 'dissolved_oxygen', name_en: 'Dissolved oxygen', name_hi: 'घुलित ऑक्सीजन', unit_assumed: 'mg/l', has_class_b_limit: true },
  { parameter_id: 'bod', name_en: 'BOD', name_hi: 'बीओडी', unit_assumed: 'mg/l', has_class_b_limit: true },
  { parameter_id: 'cod', name_en: 'COD', name_hi: 'सीओडी', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'total_solids', name_en: 'Total solids', name_hi: 'कुल ठोस', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'dissolved_solids', name_en: 'Dissolved solids', name_hi: 'घुले हुए ठोस', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'suspended_solids', name_en: 'Suspended solids', name_hi: 'निलंबित ठोस', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'turbidity', name_en: 'Turbidity', name_hi: 'गंदलापन (टर्बिडिटी)', unit_assumed: 'NTU', has_class_b_limit: false },
  { parameter_id: 'conductivity', name_en: 'Conductivity', name_hi: 'चालकता', unit_assumed: 'µS/cm', has_class_b_limit: false },
  { parameter_id: 'chromium', name_en: 'Chromium', name_hi: 'क्रोमियम', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'lead', name_en: 'Lead', name_hi: 'सीसा (लेड)', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'zinc', name_en: 'Zinc', name_hi: 'जस्ता (ज़िंक)', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'copper', name_en: 'Copper', name_hi: 'ताँबा (कॉपर)', unit_assumed: 'mg/l', has_class_b_limit: false },
  { parameter_id: 'total_coliform', name_en: 'Total coliform', name_hi: 'कुल कोलीफॉर्म', unit_assumed: 'MPN/100 ml', has_class_b_limit: true, tested_in_data: false },
];

const LIMITS = [
  { parameter_id: 'ph', cpcb_parameter: 'pH', limit_type: 'range', min: 6.5, max: 8.5, unit: null, inclusive: true, tested_in_data: true },
  { parameter_id: 'dissolved_oxygen', cpcb_parameter: 'Dissolved oxygen', limit_type: 'min', min: 5, max: null, unit: 'mg/l', inclusive: true, tested_in_data: true },
  { parameter_id: 'bod', cpcb_parameter: 'BOD (5 days 20C)', limit_type: 'max', min: null, max: 3, unit: 'mg/l', inclusive: true, tested_in_data: true },
  { parameter_id: 'total_coliform', cpcb_parameter: 'Total coliform', limit_type: 'max', min: null, max: 500, unit: 'MPN/100 ml', inclusive: true, tested_in_data: false },
];

const FESTIVAL_YEARS = [
  [2023, 'Ganesh'], [2023, 'Durga'], [2024, 'Ganesh'], [2024, 'Durga'], [2025, 'Ganesh'], [2025, 'Durga'],
];
const PHASES = ['pre', 'during', 'after'];
// Mimics the real data shape: suspended solids absent for two festival-years at every site.
const NOT_IN_PROTOCOL = new Set(['2023-Durga-suspended_solids', '2025-Durga-suspended_solids']);

const SOURCES = [2023, 2024, 2025].map((year) => ({
  source_id: `mock_${year}`,
  year,
  file: `MOCK-report-${year}.pdf`,
  repo_path: null,
  official_url: null,
  is_mock_source: true,
  note_en: 'MOCK source — no real document exists. Page numbers are invented.',
  note_hi: 'नकली स्रोत — कोई असली दस्तावेज़ नहीं। पेज नंबर काल्पनिक हैं।',
}));

// Per-ghat mock "profiles": baseline values that make the fake ranking look coherent.
const GHATS = [
  { letter: 'A', body: 'MOCK North Lake', body_hi: 'नकली उत्तर झील', pos: [0.30, 0.30], doBase: 2.2, bodBase: 14, conf: 'high' },
  { letter: 'B', body: 'MOCK South Lake', body_hi: 'नकली दक्षिण झील', pos: [0.62, 0.70], doBase: 4.4, bodBase: 7, conf: 'high' },
  { letter: 'C', body: 'MOCK North Lake', body_hi: 'नकली उत्तर झील', pos: [0.44, 0.22], doBase: 3.0, bodBase: 11, conf: 'medium' },
  { letter: 'D', body: 'MOCK South Lake', body_hi: 'नकली दक्षिण झील', pos: [0.76, 0.62], doBase: 4.6, bodBase: 6.5, conf: 'high' },
  { letter: 'E', body: 'MOCK Kund', body_hi: 'नकली कुंड', pos: [0.18, 0.72], doBase: 5.8, bodBase: 4, conf: 'high' },
  { letter: 'F', body: 'MOCK Reservoir', body_hi: 'नकली जलाशय', pos: [0.84, 0.24], doBase: 5.0, bodBase: 5, conf: 'high' },
  { letter: 'G', body: 'MOCK North Lake', body_hi: 'नकली उत्तर झील', pos: [0.26, 0.46], doBase: 6.2, bodBase: 3.6, conf: 'high' },
];

function mockValue(paramId, g, phase) {
  const bump = phase === 'during' ? 1 : phase === 'after' ? 0.5 : 0;
  switch (paramId) {
    case 'ph': return round(jitter(7.5 + bump * 0.4, 0.6), 2);
    case 'dissolved_oxygen': return Math.max(0, round(jitter(g.doBase - bump * 1.4, 1.2), 1));
    case 'bod': return round(Math.max(0.8, jitter(g.bodBase + bump * 4, 2)), 1);
    case 'cod': return round(jitter(g.bodBase * 3.2 + bump * 10, 6), 0);
    case 'total_solids': return round(jitter(380 + bump * 60, 50), 0);
    case 'dissolved_solids': return round(jitter(300 + bump * 40, 40), 0);
    case 'suspended_solids': return round(jitter(40 + bump * 25, 12), 0);
    case 'turbidity': return round(Math.max(1, jitter(8 + bump * 9, 4)), 1);
    case 'conductivity': return round(jitter(520 + bump * 70, 60), 0);
    case 'chromium': return round(Math.max(0.005, jitter(0.03, 0.02)), 3);
    case 'lead': return round(Math.max(0.005, jitter(0.04, 0.03)), 3);
    case 'zinc': return round(Math.max(0.01, jitter(0.12, 0.08)), 3);
    case 'copper': return round(Math.max(0.005, jitter(0.05, 0.03)), 3);
    default: return null;
  }
}

// Mock-only verdict helper so fake points look consistent on screen.
// The real verdict comes from Friend 1's module; the frontend never computes it.
function mockVerdict(paramId, status, value) {
  const p = PARAMETERS.find((x) => x.parameter_id === paramId);
  if (!p.has_class_b_limit) return 'no_class_b_limit';
  if (status !== 'numeric') return 'not_assessable';
  const lim = LIMITS.find((l) => l.parameter_id === paramId);
  const below = lim.min != null && value < lim.min;
  const above = lim.max != null && value > lim.max;
  return below || above ? 'breach' : 'within';
}

const pageFor = (year, festival, idx) => (festival === 'Ganesh' ? 20 : 60) + (year - 2023) * 3 + Math.floor(idx / 3);

const ghats = GHATS.map((g, gi) => {
  const site_id = `mock_ghat_${g.letter.toLowerCase()}`;
  const readings = [];
  for (const [year, festival] of FESTIVAL_YEARS) {
    const printedSite = g.conf === 'medium'
      ? (festival === 'Ganesh' ? `MOCK Kund ${g.letter} (as printed in Ganesh tables)` : `MOCK Lake-side Ghat ${g.letter} (as printed in Durga tables)`)
      : `MOCK Visarjan Ghat ${g.letter}, printed name ${year}`;
    // Ghats B and E: whole Durga 2025 table missing from the (fake) report.
    const tableMissing = year === 2025 && festival === 'Durga' && (g.letter === 'B' || g.letter === 'E');
    for (const phase of PHASES) {
      for (const p of PARAMETERS) {
        if (p.parameter_id === 'total_coliform') continue; // never tested, carried in class_b_status only
        const reading_id = `${year}-${festival.toLowerCase()}-${site_id}-${phase}-${p.parameter_id}`;
        const base = { reading_id, year, festival, phase, parameter_id: p.parameter_id, unit_assumed: p.unit_assumed };
        if (NOT_IN_PROTOCOL.has(`${year}-${festival}-${p.parameter_id}`)) {
          readings.push({ ...base, value: null, status: 'not_in_protocol', value_as_printed: null, class_b_verdict: mockVerdict(p.parameter_id, 'x'), source_id: `mock_${year}`, source_page: null, site_as_printed: null, is_synthetic: true, note_en: 'MOCK: parameter not tested at any site in this festival-year.', note_hi: 'नकली: इस वर्ष-त्योहार में किसी भी स्थल पर यह परीक्षण नहीं हुआ।' });
          continue;
        }
        if (tableMissing) {
          readings.push({ ...base, value: null, status: 'not_reported', value_as_printed: null, class_b_verdict: mockVerdict(p.parameter_id, 'x'), source_id: `mock_${year}`, source_page: null, site_as_printed: null, is_synthetic: true, note_en: `MOCK: no Durga ${year} table for this ghat in the report.`, note_hi: `नकली: रिपोर्ट में इस घाट की दुर्गा ${year} तालिका नहीं है।` });
          continue;
        }
        const idx = PARAMETERS.indexOf(p);
        const src = { source_id: `mock_${year}`, source_page: pageFor(year, festival, gi), site_as_printed: printedSite, is_synthetic: false };
        // Ghat F: mostly not sampled (drives the "insufficient data" case).
        const fMissing = g.letter === 'F' && !(year === 2024 && festival === 'Ganesh' && phase === 'during');
        // Ghat B 2025 Ganesh: only "during" sampled, printed as *, ** or blank.
        const bMissing = g.letter === 'B' && year === 2025 && festival === 'Ganesh' && phase !== 'during';
        if (fMissing || bMissing) {
          const printed = bMissing && p.parameter_id === 'ph' ? (phase === 'pre' ? '*' : '**') : (fMissing && idx % 2 ? '_' : '');
          readings.push({ ...base, value: null, status: 'not_sampled', value_as_printed: printed, class_b_verdict: mockVerdict(p.parameter_id, 'not_sampled'), ...src });
          continue;
        }
        const isMetal = ['chromium', 'lead', 'zinc', 'copper'].includes(p.parameter_id);
        if (isMetal && rand() < 0.38) {
          readings.push({ ...base, value: null, status: 'bdl', value_as_printed: 'BDL', class_b_verdict: mockVerdict(p.parameter_id, 'bdl'), ...src });
          continue;
        }
        // One deliberately unknown status to prove the UI renders it neutral grey.
        if (g.letter === 'G' && year === 2024 && festival === 'Durga' && phase === 'after' && p.parameter_id === 'turbidity') {
          readings.push({ ...base, value: null, status: 'pending_lab_review', value_as_printed: '??', class_b_verdict: 'not_assessable', ...src, note_en: 'MOCK: unknown status value used to test neutral rendering.', note_hi: 'नकली: अज्ञात स्थिति, तटस्थ प्रदर्शन जाँचने हेतु।' });
          continue;
        }
        const value = mockValue(p.parameter_id, g, phase);
        readings.push({ ...base, value, status: 'numeric', value_as_printed: String(value), class_b_verdict: mockVerdict(p.parameter_id, 'numeric', value), ...src });
      }
    }
  }

  const count = (fn) => readings.filter(fn).length;
  const known = ['numeric', 'bdl', 'not_sampled', 'not_reported', 'not_in_protocol'];
  const completeness = {
    expected_readings: count((r) => r.status !== 'not_in_protocol'),
    numeric: count((r) => r.status === 'numeric'),
    bdl: count((r) => r.status === 'bdl'),
    missing_flagged: count((r) => r.status === 'not_sampled'),
    missing_no_row: count((r) => r.status === 'not_reported'),
    not_in_protocol: count((r) => r.status === 'not_in_protocol'),
    other_status: count((r) => !known.includes(r.status)),
    percent_available: null,
    missing_tables: (g.letter === 'B' || g.letter === 'E')
      ? [{ year: 2025, festival: 'Durga', note_en: 'MOCK: no Durga 2025 table in the report', note_hi: 'नकली: रिपोर्ट में दुर्गा 2025 तालिका नहीं' }]
      : [],
    parameters_never_tested: ['total_coliform'],
  };

  const class_b_status = PARAMETERS.map((p) => {
    if (p.parameter_id === 'total_coliform') return { parameter_id: p.parameter_id, status: 'not_tested', n_assessed: 0, n_breach: 0, worst_reading_id: null };
    if (!p.has_class_b_limit) return { parameter_id: p.parameter_id, status: 'no_class_b_limit', n_assessed: null, n_breach: null, worst_reading_id: null };
    const rs = readings.filter((r) => r.parameter_id === p.parameter_id && r.class_b_verdict !== 'not_assessable' && r.status === 'numeric');
    const br = rs.filter((r) => r.class_b_verdict === 'breach');
    let status = rs.length < 3 ? 'insufficient_data' : br.length === 0 ? 'within' : br.length === rs.length ? 'breach' : 'mixed';
    const worst = p.parameter_id === 'dissolved_oxygen'
      ? [...br].sort((a, b) => a.value - b.value)[0]
      : [...br].sort((a, b) => b.value - a.value)[0];
    return { parameter_id: p.parameter_id, status, n_assessed: rs.length, n_breach: br.length, worst_reading_id: worst ? worst.reading_id : null };
  });

  const doBreaches = readings.filter((r) => r.parameter_id === 'dissolved_oxygen' && r.class_b_verdict === 'breach').sort((a, b) => a.value - b.value);
  const bodBreaches = readings.filter((r) => r.parameter_id === 'bod' && r.class_b_verdict === 'breach').sort((a, b) => b.value - a.value);
  const doAssessed = readings.filter((r) => r.parameter_id === 'dissolved_oxygen' && r.status === 'numeric').length;
  const bodAssessed = readings.filter((r) => r.parameter_id === 'bod' && r.status === 'numeric').length;

  // Hand-picked MOCK ranks/levels — including a tie (B and D at 3) and one unranked ghat (F).
  const plan = {
    A: { rank: 1, tied: false, level: 'high', score: 91, ec: 'high' },
    C: { rank: 2, tied: false, level: 'high', score: 84, ec: 'low' },
    B: { rank: 3, tied: true, level: 'elevated', score: 63, ec: 'medium' },
    D: { rank: 3, tied: true, level: 'elevated', score: 63, ec: 'high' },
    E: { rank: 5, tied: false, level: 'low', score: 31, ec: 'medium' },
    G: { rank: 6, tied: false, level: 'low', score: 22, ec: 'high' },
    F: { rank: null, tied: false, level: 'insufficient_data', score: null, ec: 'low' },
  }[g.letter];

  const reasons_en = [];
  const reasons_hi = [];
  if (plan.level !== 'insufficient_data') {
    if (doBreaches.length) {
      reasons_en.push(`MOCK: dissolved oxygen below the Class B minimum of 5 mg/l in ${doBreaches.length} of ${doAssessed} assessed readings (lowest ${doBreaches[0].value} mg/l).`);
      reasons_hi.push(`नकली: घुलित ऑक्सीजन ${doAssessed} में से ${doBreaches.length} जाँची गई रीडिंग में क्लास B न्यूनतम 5 mg/l से कम (सबसे कम ${doBreaches[0].value} mg/l)।`);
    }
    if (bodBreaches.length) {
      reasons_en.push(`MOCK: BOD above the Class B maximum of 3 mg/l in ${bodBreaches.length} of ${bodAssessed} assessed readings (highest ${bodBreaches[0].value} mg/l).`);
      reasons_hi.push(`नकली: बीओडी ${bodAssessed} में से ${bodBreaches.length} जाँची गई रीडिंग में क्लास B अधिकतम 3 mg/l से ज़्यादा (सबसे ज़्यादा ${bodBreaches[0].value} mg/l)।`);
    }
  }

  const ecReasons = {
    high: [['MOCK: all six festival tables present with three phases each.', 'नकली: सभी छह त्योहार तालिकाएँ तीनों चरणों सहित उपलब्ध।']],
    medium: [['MOCK: one festival table missing or only one phase sampled.', 'नकली: एक त्योहार तालिका गायब या केवल एक चरण का नमूना।']],
    low: g.letter === 'C'
      ? [['MOCK: site name match is medium confidence — Ganesh and Durga tables may describe two different places.', 'नकली: स्थल-नाम मिलान मध्यम विश्वास का है — गणेश और दुर्गा तालिकाएँ दो अलग स्थानों की हो सकती हैं।']]
      : [['MOCK: almost all readings not sampled.', 'नकली: लगभग सभी रीडिंग का नमूना नहीं लिया गया।']],
  }[plan.ec];

  return {
    site_id,
    site: `MOCK Ghat ${g.letter}`,
    site_hi: `नकली घाट ${g.letter}`,
    water_body: g.body,
    water_body_hi: g.body_hi,
    site_match_confidence: g.conf,
    site_as_printed_variants: [...new Set(readings.map((r) => r.site_as_printed).filter(Boolean))],
    site_warning_en: g.conf === 'medium' ? 'MOCK: Ganesh tables print "MOCK Kund C" but Durga tables print "MOCK Lake-side Ghat C". These may be two different places; readings may be mixed.' : null,
    site_warning_hi: g.conf === 'medium' ? 'नकली: गणेश तालिकाओं में "MOCK Kund C" और दुर्गा तालिकाओं में "MOCK Lake-side Ghat C" छपा है। ये दो अलग स्थान हो सकते हैं; रीडिंग मिली-जुली हो सकती हैं।' : null,
    map_position: { x: g.pos[0], y: g.pos[1] },
    rank: plan.rank,
    tied: plan.tied,
    rank_excluded_reason_en: plan.rank == null ? 'MOCK: too few sampled readings to rank fairly.' : null,
    rank_excluded_reason_hi: plan.rank == null ? 'नकली: निष्पक्ष रैंक देने के लिए बहुत कम रीडिंग।' : null,
    risk: {
      level: plan.level,
      score: plan.score,
      score_scale: plan.score == null ? null : '0–100 (MOCK scale)',
      reasons_en,
      reasons_hi,
      driver_reading_ids: [doBreaches[0], bodBreaches[0]].filter(Boolean).map((r) => r.reading_id),
    },
    evidence_confidence: {
      level: plan.ec,
      reasons_en: ecReasons.map((x) => x[0]),
      reasons_hi: ecReasons.map((x) => x[1]),
    },
    completeness,
    class_b_status,
    readings,
  };
});

const doc = {
  schema_version: '0.1-draft',
  is_mock: true,
  generated_at: '2026-10-11T12:00:00+05:30',
  generator: {
    module: 'MOCK — web/tools/generate-mock.mjs (hand-written fake data for UI testing)',
    version: 'mock-1',
    note_en: 'Every number, rank and verdict in this file is invented. Not derived from MPPCB reports.',
    note_hi: 'इस फ़ाइल का हर अंक, रैंक और निष्कर्ष काल्पनिक है। MPPCB रिपोर्ट से नहीं लिया गया।',
  },
  cpcb_class_used: 'B',
  cpcb_class_reason_en: 'MOCK placeholder: Class B (organised outdoor bathing) chosen because people enter the water at immersion ghats. Friend 1 to confirm wording.',
  cpcb_class_reason_hi: 'नकली प्लेसहोल्डर: क्लास B (संगठित बाहरी स्नान) इसलिए चुना क्योंकि विसर्जन घाटों पर लोग पानी में उतरते हैं। शब्दों की पुष्टि Friend 1 करेंगे।',
  units_assumed: true,
  rank_basis_en: 'MOCK placeholder: ranking basis will be defined by Friend 1 (years, festivals and weighting used).',
  rank_basis_hi: 'नकली प्लेसहोल्डर: रैंकिंग का आधार Friend 1 तय करेंगे (कौन से वर्ष, त्योहार और भार)।',
  sources: SOURCES,
  parameters: PARAMETERS,
  class_b_limits: LIMITS,
  known_limitations_en: [
    'MOCK DATA: this whole file is fake.',
    'Units are assumed; the original reports print no units.',
    'Only four heavy metals were tested; they have no Class B limit.',
    'Total coliform has a Class B limit but was never tested.',
  ],
  known_limitations_hi: [
    'नकली डेटा: यह पूरी फ़ाइल काल्पनिक है।',
    'इकाइयाँ मानी गई हैं; मूल रिपोर्टों में इकाइयाँ नहीं छपी हैं।',
    'केवल चार भारी धातुओं की जाँच हुई; इनकी क्लास B सीमा नहीं है।',
    'कुल कोलीफॉर्म की क्लास B सीमा है, पर इसकी जाँच कभी नहीं हुई।',
  ],
  ghats,
};

writeFileSync(OUT, JSON.stringify(doc) + '\n', 'utf8');
console.log(`MOCK file written: ${OUT} (${ghats.reduce((n, g) => n + g.readings.length, 0)} fake readings)`);
