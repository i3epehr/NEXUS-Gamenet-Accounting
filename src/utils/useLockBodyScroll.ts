import { useEffect } from 'react';

/**
 * Global reference counter for modal scroll locks.
 * Ensures that if multiple modals are mounted, the scroll lock
 * is preserved until the last modal unmounts.
 */
let lockCount = 0;
let originalBodyOverflow = '';
let originalHtmlOverflow = '';
let originalBodyPaddingRight = '';
let originalOverscroll = '';

export function useLockBodyScroll(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    if (lockCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      originalHtmlOverflow = document.documentElement.style.overflow;
      originalBodyPaddingRight = document.body.style.paddingRight;
      originalOverscroll = document.body.style.overscrollBehavior;

      // Check if scrollbar is present to prevent layout shift
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }
    lockCount++;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.paddingRight = originalBodyPaddingRight;
        document.body.style.overscrollBehavior = originalOverscroll;
      }
    };
  }, [isLocked]);
}

