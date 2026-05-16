'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import type { StorageEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

interface EventFeedProps {
  onConnectedChange?: (connected: boolean) => void;
  onEvent?: (event: StorageEvent) => void;
}

const EVENT_LABELS: Record<string, string> = {
  'object.created': 'Created',
  'object.updated': 'Updated',
  'object.deleted': 'Deleted',
  'bucket.created': 'Bucket +',
  'bucket.deleted': 'Bucket −',
  connected: 'Connected',
};

const EVENT_COLORS: Record<string, string> = {
  'object.created': 'text-emerald-400',
  'object.updated': 'text-blue-400',
  'object.deleted': 'text-red-400',
  'bucket.created': 'text-emerald-400',
  'bucket.deleted': 'text-red-400',
  connected: 'text-muted-foreground',
};

export function EventFeed({ onConnectedChange, onEvent }: EventFeedProps) {
  const [events, setEvents] = useState<(StorageEvent & { id: string })[]>([]);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const disconnect = api.connectEvents((evt) => {
      const isConnected = evt.event === 'connected';
      setConnected(true);
      onConnectedChange?.(true);

      if (!isConnected) {
        const entry = { ...evt, id: crypto.randomUUID() };
        setEvents((prev) => [entry, ...prev].slice(0, 100));
        onEvent?.(evt);
      }
    });

    return () => {
      disconnect();
      setConnected(false);
      onConnectedChange?.(false);
    };
  }, [onConnectedChange, onEvent]);

  const unread = events.length;

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <Activity className={cn('h-3.5 w-3.5', connected ? 'text-emerald-500' : 'text-muted-foreground/40')} />
        <span className="flex-1 text-xs font-medium">Live Events</span>
        {unread > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {unread > 99 ? '99+' : unread}
          </Badge>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="border-t">
          {events.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {connected ? 'Waiting for events…' : 'Connecting…'}
            </p>
          ) : (
            <ScrollArea className="h-48" ref={scrollRef}>
              <div className="divide-y divide-border/50">
                {events.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-2 px-3 py-1.5">
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 text-[10px] font-medium tabular-nums',
                        EVENT_COLORS[evt.event] ?? 'text-muted-foreground',
                      )}
                    >
                      {EVENT_LABELS[evt.event] ?? evt.event}
                    </span>
                    <div className="min-w-0 flex-1">
                      {evt.bucket && (
                        <p className="truncate text-[11px] font-mono">
                          {evt.bucket}
                          {evt.key && <span className="text-muted-foreground">/{evt.key}</span>}
                        </p>
                      )}
                      {evt.timestamp && (
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {events.length > 0 && (
            <div className="border-t px-3 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-full text-[11px]"
                onClick={() => setEvents([])}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
