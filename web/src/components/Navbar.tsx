'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { KeyRound, Settings2, Wifi, WifiOff, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, getAccessKey } from '@/lib/api';
import { ConfigDialog } from './ConfigDialog';

export function Navbar() {
  const pathname = usePathname();
  const [configOpen, setConfigOpen] = useState(false);
  const [keyId, setKeyId] = useState('');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setKeyId(getAccessKey());
    const handler = () => setKeyId(getAccessKey());
    window.addEventListener('keychange', handler);
    return () => window.removeEventListener('keychange', handler);
  }, []);

  useEffect(() => {
    const disconnect = api.connectEvents(
      (evt) => { if (evt.event === 'connected') setConnected(true); },
      () => setConnected(false),
    );
    return disconnect;
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <svg className="h-5 w-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="6" fill="currentColor" fillOpacity="0.12" />
              <rect x="6" y="8" width="20" height="4" rx="1.5" fill="currentColor" />
              <rect x="6" y="14" width="20" height="4" rx="1.5" fill="currentColor" fillOpacity="0.6" />
              <rect x="6" y="20" width="20" height="4" rx="1.5" fill="currentColor" fillOpacity="0.3" />
            </svg>
            <span className="text-sm tracking-tight">Stash</span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            <Link href="/">
              <Button
                variant={pathname === '/' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
              >
                Buckets
              </Button>
            </Link>
            <Link href="/keys">
              <Button
                variant={pathname === '/keys' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
              >
                <KeyRound className="mr-1.5 h-3 w-3" />
                Keys
              </Button>
            </Link>
            <Link href="/events">
              <Button
                variant={pathname === '/events' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 text-xs"
              >
                <Activity className="mr-1.5 h-3 w-3" />
                Events
              </Button>
            </Link>
          </nav>

          <div className="flex-1" />

          {/* SSE connection status */}
          <Tooltip>
            <TooltipTrigger render={<div className="flex items-center gap-1.5 cursor-default" />}>
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {connected ? 'API connected' : 'API disconnected'}
            </TooltipContent>
          </Tooltip>

          {/* Key badge */}
          <Tooltip>
            <TooltipTrigger render={<Badge variant="outline" className="font-mono text-[10px] cursor-default" />}>
              {keyId ? keyId.slice(0, 8) + '…' : 'No key'}
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono text-xs">{keyId || 'Not configured'}</p>
            </TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted transition-colors"
              onClick={() => setConfigOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Configure access key</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <ConfigDialog open={configOpen} onOpenChange={setConfigOpen} />
    </>
  );
}
