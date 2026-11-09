import React from 'react';
import { motion, HTMLMotionProps, Variants } from 'motion/react';

// Container variant that animates every time the screen is entered
export const screenVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

export const itemFadeUp: Variants = {
  hidden: { opacity: 0, y: 32, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const itemScale: Variants = {
  hidden: { opacity: 0, scale: 0.92, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

interface ScreenSectionProps extends HTMLMotionProps<'section'> {
  children: React.ReactNode;
  id?: string;
  className?: string;
  dataNav?: 'dark' | 'light';
  amount?: number;
}

export const AnimatedScreenSection: React.FC<ScreenSectionProps> = ({
  children,
  id,
  className = '',
  dataNav,
  amount = 0.15,
  ...props
}) => {
  return (
    <motion.section
      id={id}
      className={className}
      data-nav={dataNav}
      variants={screenVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: false, amount }}
      {...props}
    >
      {children}
    </motion.section>
  );
};

export const MotionDiv = motion.div;
export const MotionArticle = motion.article;
export const MotionH2 = motion.h2;
export const MotionP = motion.p;
