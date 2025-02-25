import { useEffect, useRef } from 'react';

// Remove explicit return type annotation to avoid type issues
export function useScrollToBottom<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);
  const endRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const end = endRef.current;

    if (container && end) {
      try {
        const observer = new MutationObserver(() => {
          try {
            end.scrollIntoView({ behavior: 'instant', block: 'end' });
          } catch (error) {
            console.error('Error in scrollIntoView:', error);
          }
        });

        observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });

        return () => {
          try {
            observer.disconnect();
          } catch (error) {
            console.error('Error disconnecting observer:', error);
          }
        };
      } catch (error) {
        console.error('Error setting up MutationObserver:', error);
      }
    }
  }, []);

  return [containerRef, endRef];
}
