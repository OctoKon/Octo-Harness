export function clickOutside(node: HTMLElement, callback: () => void = () => {}) {
  let cb = callback;
  const handle = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) cb();
  };
  document.addEventListener('mousedown', handle);
  return {
    update(next: () => void) {
      cb = next;
    },
    destroy() {
      document.removeEventListener('mousedown', handle);
    },
  };
}

/**
 * Content is revealed on mount rather than on scroll. Sections must never stay
 * invisible because a viewport never reached them (print, capture, fast jumps).
 */
export function reveal(node: HTMLElement, delay = 0) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    node.classList.add('revealed');
    return;
  }
  node.classList.add('reveal');
  node.style.transitionDelay = `${delay}ms`;
  const timer = setTimeout(() => node.classList.add('revealed'), 40);
  return {
    destroy() {
      clearTimeout(timer);
    },
  };
}
