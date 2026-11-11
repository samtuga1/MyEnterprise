import { motion, useReducedMotion } from 'framer-motion';

// The hero entrance from the taste-skill motion layer: the h1 rises line by line
// out of word masks (700ms a line, 80ms apart), then what follows fades up 12px
// (520ms, 60ms apart) as the last line is half way up. Once, on load; never on scroll.
const EASE_ENTER = [0.22, 1, 0.36, 1];

export function EnterTitle({ lines, as: Tag = 'h1', className, id }) {
  const reduce = useReducedMotion();
  return (
    <Tag className={className} id={id}>
      {lines.map((line, i) => (
        <span key={i} className="enter-line">
          <motion.span className="enter-line__inner" initial={reduce ? false : { y: '105%' }} animate={{ y: '0%' }}
            transition={{ duration: 0.7, delay: 0.08 * i, ease: EASE_ENTER }}>
            {line}
          </motion.span>
          {i < lines.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  );
}

export function EnterFade({ index = 0, lineCount = 2, children, className, as = 'div' }) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  const start = 0.08 * (lineCount - 1) + 0.35;
  return (
    <Comp className={className} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.52, delay: start + 0.06 * index, ease: EASE_ENTER }}>
      {children}
    </Comp>
  );
}

/** The hero picture settles from 1.05 to 1 over 1.1 s; it is never hidden. */
export function EnterMedia({ children, className }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { scale: 1.05 }} animate={{ scale: 1 }} transition={{ duration: 1.1, ease: EASE_ENTER }}>
      {children}
    </motion.div>
  );
}
