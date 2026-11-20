import { useCallback, useEffect, useState } from 'react';

/** Tiny hash router: '#/' is the world map, '#/room/<id>' is a memory room. */
function parse() {
  const m = window.location.hash.match(/^#\/room\/(.+)$/);
  return m ? { view: 'room', id: decodeURIComponent(m[1]) } : { view: 'map' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next, { replace = false } = {}) => {
    const hash = next.view === 'room' ? `#/room/${encodeURIComponent(next.id)}` : '#/';
    if (replace) window.history.replaceState(null, '', hash);
    else window.history.pushState(null, '', hash);
    setRoute(parse());
  }, []);

  return [route, go];
}
