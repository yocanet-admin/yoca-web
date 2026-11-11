'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_YOCA, VIEWPORT_ONCE } from '@/lib/motion';

/**
 * Yoca — signature type reveal.
 * Splits a heading into words; each word rises out of its own clipping box
 * (110% → 0) with a short stagger — type is "printed" onto the page rather
 * than faded in. `emphasis` words get the lime underline. Works in RTL
 * (words keep their order; letters inside a word are never split).
 * Static under prefers-reduced-motion.
 */

interface SplitWordsProps {
  text: string;
  emphasis?: string[];
  /** Start on mount ("load") or when scrolled into view ("view"). */
  trigger?: 'load' | 'view';
  delay?: number;
  stagger?: number;
  className?: string;
  /** Multi-sentence headings break after each sentence ("Tek süreç. / Kapalı kutu yok."). Default: on. */
  breakSentences?: boolean;
}

/** Split into sentences without lookbehind (tsconfig target): ends on . ! ? ؟ followed by space. */
function toSentences(text: string): string[] {
  const out: string[] = [];
  let current = '';
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    current += chars[i];
    const isEnd = /[.!?؟]/.test(chars[i]) && (i === chars.length - 1 || /\s/.test(chars[i + 1]));
    if (isEnd) {
      out.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

export default function SplitWords({
  text,
  emphasis = [],
  trigger = 'view',
  delay = 0,
  stagger = 0.045,
  className,
  breakSentences = true,
}: SplitWordsProps) {
  const reduced = useReducedMotion();
  const sentences = breakSentences ? toSentences(text) : [text];
  // Words carry their sentence index so line breaks land between sentences.
  const words: Array<{ word: string; sentence: number }> = [];
  sentences.forEach((sentence, si) => {
    sentence.split(/\s+/).filter(Boolean).forEach((word) => words.push({ word, sentence: si }));
  });
  const multi = sentences.length > 1;
  // Strip surrounding punctuation (any script) without Unicode-property regex (tsconfig target).
  const core = (word: string) => word.replace(/^[\s.,;:!?"'()\[\]{}«»،؛؟\-–—]+|[\s.,;:!?"'()\[\]{}«»،؛؟\-–—]+$/g, '');
  const isEmphasis = (word: string) => emphasis.some((e) => core(word) === core(e));

  const wordVariants = {
    hidden: { y: '125%' },
    visible: (index: number) => ({
      y: '0%',
      transition: { duration: 0.7, delay: delay + index * stagger, ease: EASE_YOCA },
    }),
  };

  // The observer must watch the un-clipped wrapper: words start translated
  // out of their overflow-hidden boxes, so observing them directly would
  // never report an intersection.
  // Same markup with or without reduced motion (hydration-safe); reduced
  // motion simply starts in the final state.
  const trigger_props = reduced
    ? { initial: false as const, animate: 'visible' }
    : trigger === 'load'
      ? { initial: 'hidden', animate: 'visible' }
      : { initial: 'hidden', whileInView: 'visible', viewport: VIEWPORT_ONCE };

  return (
    <motion.span className={className} {...trigger_props}>
      {words.map(({ word, sentence }, index) => (
        <span key={index}>
          <span className="inline-block overflow-hidden align-bottom pb-[0.3em] -mb-[0.3em] pt-[0.12em] -mt-[0.12em] pe-[0.08em] -me-[0.08em]">
            <motion.span variants={wordVariants} custom={index} className="inline-block">
              {isEmphasis(word) ? (
                <span className="underline decoration-yoca-lime decoration-[0.045em] underline-offset-[0.06em]">{word}</span>
              ) : (
                word
              )}
            </motion.span>
          </span>
          {index < words.length - 1 ? (multi && words[index + 1].sentence !== sentence ? <br /> : ' ') : ''}
        </span>
      ))}
    </motion.span>
  );
}
