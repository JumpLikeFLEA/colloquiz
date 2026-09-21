import { describe, it, expect } from 'vitest';
import { checkedAcceptanceLines, normalizeAcceptanceLine } from './bootstrap-board.mjs';
import { CARDS } from './backlog.mjs';

// OPS-005 (docs/decisions/0015): a ticked acceptance line in the live issue
// must survive dash/smart-quote/trailing-whitespace normalisation GitHub or
// a hand-edit applies, while a genuinely reworded line still renders
// unticked. `checkedAcceptanceLines` reads the live issue body;
// `normalizeAcceptanceLine` is the shared key both it and `cardBody` compare
// through.

function issueBody(...lines) {
  return ['Some goal text.', '', '## Acceptance', '', ...lines.map((l) => `- [x] ${l}`)].join('\n');
}

describe('normalizeAcceptanceLine', () => {
  it('treats "--", en dash and em dash as the same dash', () => {
    const a = normalizeAcceptanceLine('Scoring works -- not position.');
    const b = normalizeAcceptanceLine('Scoring works – not position.'); // en dash
    const c = normalizeAcceptanceLine('Scoring works — not position.'); // em dash
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('treats smart and straight quotes as the same quote', () => {
    const straight = normalizeAcceptanceLine(`The learner's answer.`);
    const curly = normalizeAcceptanceLine('The learner’s answer.');
    expect(straight).toBe(curly);
  });

  it('trims trailing whitespace', () => {
    expect(normalizeAcceptanceLine('Some line.   ')).toBe('Some line.');
  });

  it('does not touch a hyphen inside a compound word', () => {
    expect(normalizeAcceptanceLine('multi-answer scoring')).toBe('multi-answer scoring');
  });

  it('a genuinely different line still normalises to a different string', () => {
    const original = normalizeAcceptanceLine('Credit is per correct option.');
    const reworded = normalizeAcceptanceLine('Credit is per correct answer.');
    expect(original).not.toBe(reworded);
  });
});

describe('checkedAcceptanceLines', () => {
  it('matches a line that differs only by dash form', () => {
    const checked = checkedAcceptanceLines(issueBody('Scoring works — not on position.'));
    expect(checked.has(normalizeAcceptanceLine('Scoring works -- not on position.'))).toBe(true);
  });

  it('matches a line that differs only by smart quote', () => {
    const checked = checkedAcceptanceLines(issueBody('The learner’s answer counts.'));
    expect(checked.has(normalizeAcceptanceLine(`The learner's answer counts.`))).toBe(true);
  });

  it('matches a line that differs only by trailing whitespace', () => {
    const checked = checkedAcceptanceLines(issueBody('Some acceptance line.   '));
    expect(checked.has(normalizeAcceptanceLine('Some acceptance line.'))).toBe(true);
  });

  it('does NOT match a genuinely changed acceptance line', () => {
    const checked = checkedAcceptanceLines(issueBody('Credit is per correct option.'));
    expect(checked.has(normalizeAcceptanceLine('Credit is per correct answer.'))).toBe(false);
  });

  it('returns an empty set for no existing body', () => {
    expect(checkedAcceptanceLines(null).size).toBe(0);
    expect(checkedAcceptanceLines('').size).toBe(0);
  });
});

describe('the ITEM-002 case', () => {
  const item002 = CARDS.find((c) => c.key === 'ITEM-002');

  it('exists in the backlog with its real acceptance text', () => {
    expect(item002).toBeTruthy();
    expect(item002.acceptance.some((a) => a.includes('No scoring depends on presentation order'))).toBe(true);
  });

  it('every ITEM-002 acceptance line, ticked in a live issue with normalised punctuation, still reads as checked', () => {
    // Simulate the live issue echoing the canonical text back with every
    // "--" widened to an em dash and trailing whitespace added — the exact
    // class of drift this card exists to tolerate.
    const driftedLines = item002.acceptance.map((a) => `${a.replace(/--/g, '—')}   `);
    const checked = checkedAcceptanceLines(issueBody(...driftedLines));
    for (const a of item002.acceptance) {
      expect(checked.has(normalizeAcceptanceLine(a))).toBe(true);
    }
  });

  it('a hand-edited ITEM-002 line that actually changes wording still renders unticked', () => {
    const [first, ...rest] = item002.acceptance;
    const reworded = first.replace('reuses', 'uses');
    const checked = checkedAcceptanceLines(issueBody(reworded, ...rest));
    expect(checked.has(normalizeAcceptanceLine(first))).toBe(false);
  });
});
