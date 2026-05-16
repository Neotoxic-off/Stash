'use client';

import { useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { NewAccessKey } from '@/lib/types';

interface CreateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function CreateKeyDialog({ open, onOpenChange, onCreated }: CreateKeyDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<NewAccessKey | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const key = await api.createKey(name.trim());
      setCreated(key);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setCreated(null);
    onOpenChange(false);
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value).then(() => toast.success(`${label} copied`));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Access Key</DialogTitle>
          <DialogDescription>
            {created
              ? 'Save the secret now — it will not be shown again.'
              : 'Create a new access key to authenticate API requests.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Key ID</Label>
              <div className="flex gap-2">
                <Input value={created.id} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(created.id, 'Key ID')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Secret Key</Label>
              <div className="flex gap-2">
                <Input value={created.secret} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(created.secret, 'Secret')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-destructive font-medium">
              The secret key will not be shown again after closing this dialog.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. ci-pipeline, backend-service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          {created ? (
            <Button onClick={handleClose} className="w-full">
              I saved the secret — close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={loading || !name.trim()}>
                {loading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Create
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
