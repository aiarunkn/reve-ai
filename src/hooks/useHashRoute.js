import { useCallback, useEffect, useState } from 'react';

/**
 * Tiny hash router:
 *   #/               world map
 *   #/room/<id>      a memory room
 *   #/world/<id>     an imagined world
 *   #/story/<id>     an interactive story
 */
function parse() {
  const m = window.location.hash.match(/^#\/(room|world|story)\/(.+)$/);
  return m ? { view: m[1], id: decodeURIComponent(m[2]) } : { view: 'map' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next, { replace = false } = {}) => {
    const hash = next.view === 'map' ? '#/' : `#/${next.view}/${encodeURIComponent(next.id)}`;
    if (replace) window.history.replaceState(null, '', hash);
    else window.history.pushState(null, '', hash);
    setRoute(parse());
  }, []);

  return [route, go];
}
