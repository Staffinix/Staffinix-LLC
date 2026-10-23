import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={routeKey}
      className="flex min-h-full flex-col"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.1 }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : "hidden"}
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: reduceMotion ? { duration: 0 } : { staggerChildren: 0.045 },
        },
      }}
    >
      {children}
    </motion.div>
  );
}
