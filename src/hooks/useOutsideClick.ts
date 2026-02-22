import { useEffect, useCallback, RefObject } from 'react';

/**
 * Hook that alerts clicks outside of the passed ref
 */
export function useOutsideClick(ref: RefObject<HTMLElement | null>, handler: () => void) {
    const handleClickOutside = useCallback(
        (event: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                handler();
            }
        },
        [ref, handler]
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [handleClickOutside]);
}
