import { describe, expect, it } from 'vitest';
import { buildIndex, changedFraction, confident, dHash, hamming, matchPage, pickTitle, resolveGoal, tokens } from '@/lib/docs/match';

const lecture = [
  { title: 'Ancient Philosophy', text: 'Lecture 3. Ancient Philosophy. From the Presocratics to Aristotle.' },
  { title: 'The Presocratics', text: 'Thales said everything is water. Heraclitus: everything flows. Parmenides: change is illusion.' },
  { title: 'Socrates and the Elenchus', text: 'Socratic method of questioning. Know thyself. The unexamined life is not worth living.' },
  { title: 'Plato: The Theory of Forms', text: 'Forms are perfect abstract realities. The allegory of the cave. Justice in the Republic.' },
  { title: 'Plato vs Aristotle on the Forms', text: 'Aristotle rejected separate Forms. Form exists in matter. Hylomorphism.' },
  { title: 'Aristotle: Virtue Ethics', text: 'Eudaimonia as the highest good. Virtue is a mean between extremes. Habituation builds character.' },
  { title: 'Hellenistic Schools', text: 'Stoicism, Epicureanism and Skepticism after Aristotle.' },
];

describe('plain-language goals', () => {
  it('finds the first slide titled with every word', () => {
    expect(resolveGoal('study up until the Aristotle slide', lecture)).toEqual({ page: 5, how: 'title' });
    expect(resolveGoal('up to Aristotle virtue ethics', lecture)).toEqual({ page: 6, how: 'title' });
    expect(resolveGoal('the theory of forms', lecture)).toEqual({ page: 4, how: 'title' });
  });
  it('searches from the resume point onwards', () => {
    expect(resolveGoal('Aristotle', lecture, 6)).toEqual({ page: 6, how: 'title' });
  });
  it('understands numbers and "the end"', () => {
    expect(resolveGoal('slide 4', lecture)).toEqual({ page: 4, how: 'number' });
    expect(resolveGoal('6', lecture)).toEqual({ page: 6, how: 'number' });
    expect(resolveGoal('up to page 99', lecture)).toEqual({ page: 7, how: 'number' });
    expect(resolveGoal('finish the whole thing', lecture)).toEqual({ page: 7, how: 'end' });
  });
  it('falls back to words in the slide body', () => {
    expect(resolveGoal('the allegory of the cave', lecture)).toEqual({ page: 4, how: 'text' });
  });
  it('gives up cleanly when nothing matches', () => {
    expect(resolveGoal('quantum mechanics', lecture)).toBeNull();
    expect(resolveGoal('', lecture)).toBeNull();
  });
});

describe('matching the screen to a slide', () => {
  const index = buildIndex(lecture);
  it('recognizes a slide from noisy OCR text', () => {
    const ocr = 'Aristotle: Virtue Ethics\n• Eudaimonia as the highest goad\n• Virtue is a mean betwen extremes\nPHIL 101';
    const g = matchPage(ocr, index);
    expect(g?.page).toBe(6);
    expect(confident(g)).toBe(true);
  });
  it('tells apart two slides that share a heading word', () => {
    expect(matchPage('Plato vs Aristotle on the Forms — Aristotle rejected separate Forms; form exists in matter', index)?.page).toBe(5);
    expect(matchPage('Plato: The Theory of Forms. The allegory of the cave', index)?.page).toBe(4);
  });
  it('trusts a visible slide counter', () => {
    expect(matchPage('some unreadable text   3 / 7', index)).toEqual({ page: 3, score: 1, margin: 1 });
  });
  it('is not confident about an unrelated screen', () => {
    expect(confident(matchPage('Inbox (3) — Re: lunch on Friday?', index))).toBe(false);
  });
});

describe('screen change detection', () => {
  const ramp = Array.from({ length: 72 }, (_, i) => i % 9);
  it('gives identical frames the same hash and different frames a far one', () => {
    const flipped = ramp.map((v) => 8 - v);
    expect(hamming(dHash(ramp), dHash(ramp))).toBe(0);
    expect(hamming(dHash(ramp), dHash(flipped))).toBe(64);
  });
  it('notices a new slide on the same template but not video noise', () => {
    const blank = new Array(64 * 36).fill(250);
    const slideA = blank.slice(); for (let i = 64 * 4 + 6; i < 64 * 4 + 40; i++) slideA[i] = 20; // a title line
    const slideB = blank.slice(); for (let i = 64 * 4 + 6; i < 64 * 4 + 28; i++) slideB[i] = 20; // a shorter title
    const noisy = slideA.map((v, i) => v + (i % 7) - 3);
    expect(changedFraction(slideA, slideB)).toBeGreaterThan(0.004);
    expect(changedFraction(slideA, noisy)).toBe(0);
    expect(changedFraction(slideA, null)).toBe(1);
  });
  it('picks the tall line near the top as the title', () => {
    expect(pickTitle([
      { text: 'Aristotle: Virtue Ethics', height: 48, top: 60 },
      { text: 'Eudaimonia as the highest good', height: 22, top: 200 },
      { text: 'PHIL 101 — Week 3', height: 50, top: 650 },
    ], 720)).toBe('Aristotle: Virtue Ethics');
  });
  it('ignores filler words', () => {
    expect(tokens('The Theory of Forms and the Cave')).toEqual(['theory', 'forms', 'cave']);
  });
});
