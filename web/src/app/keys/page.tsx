'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, RefreshCw, KeyRound, Loader2, CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { CreateKeyDialog } from '@/components/CreateKeyDialog';
import { api, formatDate, isConfigured } from '@/lib/api';
import type { AccessKey } from '@/lib/types';

export default function KeysPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<AccessKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccessKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await api.listKeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) await api.autoConfigureKey();
      if (!isConfigured()) { router.replace('/'); return; }
      load();
    };
    init();
  }, [load, router]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteKey(deleteTarget.id);
      toast.success(`Key "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete key');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Access Keys</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {keys.length} key{keys.length !== 1 ? 's' : ''}
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
              New Key
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <CircleAlert className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={load}>
              Retry
            </Button>
          </div>
        )}

        {loading && keys.length === 0 && (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !error && keys.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
            <KeyRound className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-sm font-medium">No access keys</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a key to authenticate API requests.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Key
            </Button>
          </div>
        )}

        {keys.length > 0 && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Key ID</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground md:table-cell">Created</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.map((key) => (
                  <tr key={key.id} className="group hover:bg-accent/5 transition-colors">
                    <td className="px-4 py-3 font-medium">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                        {key.id}
                      </code>
                    </td>
                    <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground md:table-cell">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={key.isActive ? 'default' : 'secondary'} className="text-[10px]">
                        {key.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                            onClick={() => setDeleteTarget(key)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>Delete key</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete key</DialogTitle>
            <DialogDescription>
              Delete key <span className="font-mono font-medium">{deleteTarget?.name}</span>?
              Services using this key will lose access immediately.
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
