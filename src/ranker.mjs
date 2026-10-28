// Local scoring: brief × mode profiles -> ranked candidates, no AI call.
// Score = axis closeness + tag matches + imagery keywords + energy fit
//         - penalties, roughly 0..1.
//
// v2 (M2 baseline): `story` is weighted down because nearly every brief rates
// it 0.8+, so it told modes apart by noise; imagery keywords were added for
// modes defined by a concrete image (fireworks, the cosmos, light and fog...).

import { PROFILES } from './profiles.mjs';

const AXIS_WEIGHTS = { motion: 1.2, density: 0.6, warmth: 0.6, space: 0.8, story: 0.4 };
const TAG_FIT = 0.06;
const TAG_AVOID = 0.1;
const TAG_CAP = 0.18;
const KEYWORD_HIT = 0.06;
const KEYWORD_CAP = 0.12;
const DECISIVE_GAP = 0.08;
const DECISIVE_CONFIDENCE = 0.7;

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const axisCloseness = (visual, axes) => {
  let total = 0;
  let weights = 0;
  for (const [axis, weight] of Object.entries(AXIS_WEIGHTS)) {
    if (visual?.[axis] === undefined) continue;
    total += weight * Math.abs(clamp01(visual[axis]) - axes[axis]);
    weights += weight;
  }
  return weights > 0 ? 1 - total / weights : 0.5;
};

const energyFit = (energy, [low, high]) => {
  if (energy === undefined || energy === null) return 0;
  const value = clamp01(energy);
  if (value >= low && value <= high) return 0.04;
  return -0.4 * (value < low ? low - value : value - high);
};

/* The brief's own words, where an image like "烟花" or "星空" would show up. */
const imageryText = (brief) => [
  ...(Array.isArray(brief?.imagery) ? brief.imagery : []),
  brief?.summary ?? '',
  brief?.arc ?? '',
].join(' ');

/**
 * @param brief  the step-1 brief
 * @param modeIds modes available right now (live registry)
 * @param bias   optional mode -> score adjustment learnt from the user (M5)
 * @returns {{ ranked: {id, score, why}[], unprofiled: string[], decisive: boolean }}
 */
export const rankModes = (brief, modeIds, bias = {}) => {
  const tags = new Set(Array.isArray(brief?.tags) ? brief.tags : []);
  const text = imageryText(brief);
  const ranked = [];
  const unprofiled = [];
  for (const id of modeIds) {
    const profile = PROFILES[id];
    if (!profile) {
      unprofiled.push(id);
      continue;
    }
    const closeness = axisCloseness(brief?.visual, profile.axes);
    const fitHits = profile.fit.filter((tag) => tags.has(tag));
    const avoidHits = profile.avoid.filter((tag) => tags.has(tag));
    const tagScore = Math.max(-TAG_CAP, Math.min(TAG_CAP, fitHits.length * TAG_FIT - avoidHits.length * TAG_AVOID));
    const keywordHits = (profile.keywords ?? []).filter((word) => text.includes(word));
    const keywordScore = Math.min(KEYWORD_CAP, keywordHits.length * KEYWORD_HIT);
    const taste = Number(bias[id]) || 0;
    const score = closeness + tagScore + keywordScore + energyFit(brief?.energy?.overall, profile.energy) - (profile.penalty ?? 0) + taste;
    ranked.push({
      id,
      score: Math.round(score * 1000) / 1000,
      why: { closeness: Math.round(closeness * 100) / 100, fit: [...fitHits, ...keywordHits.map((word) => `「${word}」`)], avoid: avoidHits, ...(taste ? { taste } : {}) },
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  const gap = ranked.length > 1 ? ranked[0].score - ranked[1].score : 1;
  const decisive = gap >= DECISIVE_GAP && clamp01(brief?.confidence) >= DECISIVE_CONFIDENCE;
  return { ranked, unprofiled, decisive };
};
