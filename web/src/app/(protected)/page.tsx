'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Database, Plus, Trash2, RefreshCw, Loader2, CircleAlert } from 'lucide-react';
import { ServerStackIcon } from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CreateBucketDialog } from '@/components/CreateBucketDialog';
import { ConfigDialog } from '@/components/ConfigDialog';
import { api, formatDate, isConfigured } from '@/lib/api';
import type { Bucket } from '@/lib/types';

export default function HomePage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBuckets(await api.listBuckets());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load buckets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const autoOk = await api.autoConfigureKey();
      if (autoOk || isConfigured()) {
        setConfigured(true);
        load();
      } else {
        setSetupOpen(true);
      }
    };
    init();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteBucket(deleteTarget);
      toast.success(`Bucket "${deleteTarget}" deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete bucket');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Buckets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {buckets.length} bucket{buckets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Bucket
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <CircleAlert className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && buckets.length === 0 && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && configured && buckets.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
            <Database className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-sm font-medium">No buckets yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first bucket to start storing files.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Bucket
            </Button>
          </div>
        )}

        {/* Bucket grid */}
        {buckets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {buckets.map((bucket) => (
              <div
                key={bucket.name}
                className="group relative rounded-lg border bg-card p-4 transition-colors hover:bg-accent/5"
              >
                <Link href={`/${bucket.name}`} className="absolute inset-0 rounded-lg" />

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <ServerStackIcon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="truncate text-sm font-medium">{bucket.name}</p>
                  </div>

                  <Tooltip>
                    <TooltipTrigger
                      className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        setDeleteTarget(bucket.name);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent>Delete bucket</TooltipContent>
                  </Tooltip>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5">S3</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(bucket.creationDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}


      </main>

      <CreateBucketDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      <ConfigDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onConfigured={() => { setConfigured(true); load(); }}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete bucket</DialogTitle>
            <DialogDescription>
              Delete <span className="font-mono font-medium">{deleteTarget}</span>?
              The bucket must be empty.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
