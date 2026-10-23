import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, Discovery } from '../game/api';

export const FEED_POLL_MS = 60_000;
export const FEED_SEEN_KEY = 'ig.feedSeen';
const FEED_MAX = 20;

/** Merge by id, newest first, at most FEED_MAX. */
function merge(old: Discovery[], incoming: Discovery[]): Discovery[] {
  const byId = new Map<number, Discovery>();
  for (const d of [...old, ...incoming]) byId.set(d.id, d);
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, FEED_MAX);
}

/** The recent rare discoveries: fetched on going online, then polled; errors keep the old list. */
export function useDiscoveryFeed(
  api: Pick<ApiClient, 'recentDiscoveries'>,
  online: boolean,
): { entries: Discovery[]; refresh: () => void } {
  const [entries, setEntries] = useState<Discovery[]>([]);
  const latest = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  const onlineRef = useRef(online);
  const apiRef = useRef(api);
  useEffect(() => {
    onlineRef.current = online;
    apiRef.current = api;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback((): void => {
    if (!onlineRef.current) return;
    apiRef.current
      .recentDiscoveries(latest.current)
      .then((list) => {
        if (!alive.current || list.length === 0) return;
        setEntries((old) => {
          const next = merge(old, list);
          latest.current = next[0]?.id;
          return next;
        });
      })
      .catch(() => {
        // silent: keep the old list (a 401 is handled by the sync flow)
      });
  }, []);

  useEffect(() => {
    if (!online) return;
    refresh();
    const t = setInterval(refresh, FEED_POLL_MS);
    return () => clearInterval(t);
  }, [online, refresh]);

  return { entries, refresh };
}
