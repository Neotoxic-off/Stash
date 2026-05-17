'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Pause, Play, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, formatBytes, isConfigured } from '@/lib/api';
import type { StorageEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

type EventRow = StorageEvent & { id: string; receivedAt: Date };

const EVENT_TYPES = ['all', 'object.created', 'object.updated', 'object.deleted', 'bucket.created', 'bucket.deleted'] as const;

const EVENT_META: Record<string, { label: string; className: string }> = {
  'object.created':  { label: 'CREATED', className: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  'object.updated':  { label: 'UPDATED', className: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  'object.deleted':  { label: 'DELETED', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
  'bucket.created':  { label: 'BUCKET +', className: 'bg-violet-500/10 text-violet-400 border border-violet-500/20' },
  'bucket.deleted':  { label: 'BUCKET −', className: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' },
};

const TYPE_LABELS: Record<string, string> = {
  all: 'All',
  'object.created': 'Created',
  'object.updated': 'Updated',
  'object.deleted': 'Deleted',
  'bucket.created': 'Bucket +',
  'bucket.deleted': 'Bucket −',
};

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [filterBucket, setFilterBucket] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const pausedRef = useRef(false);
  const pendingRef = useRef<EventRow[]>([]);

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) await api.autoConfigureKey();
      if (!isConfigured()) { router.replace('/'); }
    };
    init();
  }, [router]);

  useEffect(() => {
    const disconnect = api.connectEvents((evt) => {
      if (evt.event === 'connected') { setConnected(true); return; }
      const row: EventRow = { ...evt, id: crypto.randomUUID(), receivedAt: new Date() };
      if (pausedRef.current) {
        pendingRef.current = [row, ...pendingRef.current];
        setPendingCount((n) => n + 1);
        return;
      }
      setEvents((prev) => [row, ...prev].slice(0, 1000));
    });
    return () => { disconnect(); setConnected(false); };
  }, []);

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (!next && pendingRef.current.length > 0) {
      setEvents((prev) => [...pendingRef.current, ...prev].slice(0, 1000));
      pendingRef.current = [];
      setPendingCount(0);
    }
  };

  const filtered = events.filter((e) => {
    if (filterBucket && !e.bucket?.toLowerCase().includes(filterBucket.toLowerCase())) return false;
    if (filterType !== 'all' && e.event !== filterType) return false;
    return true;
  });

  return (
    <>
      <main className="flex h-[calc(100vh-3.5rem)] flex-col px-4 py-5 max-w-7xl mx-auto">
        {/* Header row */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 mr-auto">
            <h1 className="text-lg font-semibold tracking-tight">Live Events</h1>
            <div className="flex items-center gap-1.5">
              {connected
                ? <><Wifi className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs text-emerald-500">live</span></>
                : <><WifiOff className="h-3.5 w-3.5 text-muted-foreground/40" /><span className="text-xs text-muted-foreground/40">disconnected</span></>
              }
            </div>
            <Badge variant="outline" className="font-mono text-[10px]">{filtered.length}</Badge>
          </div>

          <Button
            variant={paused ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={togglePause}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? `Resume${pendingCount > 0 ? ` (${pendingCount})` : ''}` : 'Pause'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setEvents([]); pendingRef.current = []; setPendingCount(0); }}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        </div>

        {/* Filter bar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Bucket filter…"
            value={filterBucket}
            onChange={(e) => setFilterBucket(e.target.value)}
            className="h-7 w-44 text-xs"
          />
          <div className="flex items-center rounded-md border bg-muted/20">
            {EVENT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  'px-2.5 py-1 text-[11px] transition-colors first:rounded-l-md last:rounded-r-md',
                  filterType === t
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Stream table */}
        <div className="flex-1 overflow-hidden rounded-lg border bg-card">
          {/* Column header */}
          <div className="grid grid-cols-[9rem_6.5rem_minmax(0,1fr)_minmax(0,2fr)_5.5rem] border-b bg-muted/40 px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
            <span>Timestamp</span>
            <span>Type</span>
            <span>Bucket</span>
            <span>Key</span>
            <span className="text-right">Size</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Activity className={cn('h-9 w-9', connected ? 'text-muted-foreground/20' : 'text-destructive/30')} />
              {connected ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {events.length > 0 ? 'No events match the current filter.' : 'Waiting for events…'}
                  </p>
                  <p className="text-xs text-muted-foreground/50">
                    Upload, delete, or modify files to see live events here.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Not connected</p>
                  <p className="text-xs text-muted-foreground/50">
                    The SSE stream closed. Reload to reconnect.
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-xs mt-1" onClick={() => window.location.reload()}>
                    Reconnect
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="h-full overflow-y-auto">
              {filtered.map((evt) => {
                const meta = EVENT_META[evt.event];
                return (
                  <div
                    key={evt.id}
                    className="grid grid-cols-[9rem_6.5rem_minmax(0,1fr)_minmax(0,2fr)_5.5rem] items-center gap-2 border-b border-border/30 px-4 py-1.5 text-xs hover:bg-muted/20 transition-colors"
                  >
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {evt.receivedAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                      <span className="text-muted-foreground/40">
                        .{String(evt.receivedAt.getMilliseconds()).padStart(3, '0')}
                      </span>
                    </span>
                    <span>
                      {meta ? (
                        <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-medium', meta.className)}>
                          {meta.label}
                        </span>
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground">{evt.event}</span>
                      )}
                    </span>
                    <span className="truncate font-mono text-[11px]">{evt.bucket ?? <span className="text-muted-foreground/40">—</span>}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{evt.key ?? <span className="text-muted-foreground/40">—</span>}</span>
                    <span className="text-right font-mono tabular-nums text-muted-foreground">
                      {evt.size != null ? formatBytes(evt.size) : <span className="text-muted-foreground/40">—</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
