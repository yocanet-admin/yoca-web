'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { usePrefersReducedMotion } from '@/lib/reducedMotion';
import SplitWords from '@/components/ui/SplitWords';
import { MOTION } from '@/lib/motion';

/**
 * Yoca — footer closing moment.
 * "Made to move forward." set large (word reveal on scroll) above the
 * oversized outlined YOCA, which leans a few pixels with the pointer.
 */
export default function FooterMark() {
  const reduced = usePrefersReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 50, damping: 18 });
  const y = useSpring(my, { stiffness: 50, damping: 18 });
  const onMove = (event: React.PointerEvent) => {
    if (reduced || event.pointerType !== 'mouse') return;
    const rect = event.currentTarget.getBoundingClientRect();
    mx.set(((event.clientX - rect.left) / rect.width - 0.5) * MOTION.pointer.max * 2);
    my.set(((event.clientY - rect.top) / rect.height - 0.5) * MOTION.pointer.max);
  };
  return (
    <div onPointerMove={onMove} onPointerLeave={() => { mx.set(0); my.set(0); }} className="mt-14 select-none">
      <p className="max-w-[12ch] text-[clamp(40px,7vw,112px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-soft" dir="ltr">
        <SplitWords text="Made to move forward." breakSentences={false} />
      </p>
      <motion.p
        aria-hidden="true"
        style={{ x, y }}
        className="wordmark-outline pointer-events-none mt-6 text-center leading-none"
      >
        YOCA
      </motion.p>
    </div>
  );
}
