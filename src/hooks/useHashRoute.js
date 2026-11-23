import { useCallback, useEffect, useState } from 'react';

/**
 * Tiny hash router:
 *   #/               world map
 *   #/world/<id>     an imagined world
 *   #/story/<id>     an interactive story
 *   #/w/<CODE>       an invite to a shared world
 */
function parse() {
  const invite = window.location.hash.match(/^#\/w\/([A-Za-z]{6})\/?$/);
  if (invite) return { view: 'join', id: invite[1].toUpperCase() };
  const m = window.location.hash.match(/^#\/(world|story)\/(.+)$/);
  if (m) return { view: m[1], id: decodeURIComponent(m[2]) };
  // anything else (including old #/room/<id> links) goes home, with a clean address
  if (window.location.hash && window.location.hash !== '#/') window.history.replaceState(null, '', '#/');
  return { view: 'map' };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next, { replace = false } = {}) => {
    const hash = next.view === 'map' ? '#/' : next.view === 'join' ? `#/w/${next.id}` : `#/${next.view}/${encodeURIComponent(next.id)}`;
    if (replace) window.history.replaceState(null, '', hash);
    else window.history.pushState(null, '', hash);
    setRoute(parse());
  }, []);

  return [route, go];
}
