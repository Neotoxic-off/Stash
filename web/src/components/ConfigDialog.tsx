'use client';

import { useState, useEffect } from 'react';
import { Loader2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { api, getAccessKey, setAccessKey } from '@/lib/api';
import type { AccessKey } from '@/lib/types';

interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured?: () => void;
}

export function ConfigDialog({ open, onOpenChange, onConfigured }: ConfigDialogProps) {
  const [keyId, setKeyId] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [retrievedKeys, setRetrievedKeys] = useState<AccessKey[]>([]);

  useEffect(() => {
    if (open) {
      setKeyId(getAccessKey());
      setUnlockPassword('');
      setRetrievedKeys([]);
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    if (keyId) onConfigured?.();
  };

  const handleSave = () => {
    if (!keyId.trim()) {
      toast.error('Access key ID is required');
      return;
    }
    setAccessKey(keyId.trim());
    toast.success('Access key saved');
    onOpenChange(false);
    onConfigured?.();
  };

  const handleUnlock = async () => {
    if (!unlockPassword.trim()) {
      toast.error('Password required');
      return;
    }
    setUnlockLoading(true);
    try {
      const keys = await api.unlockKeys(unlockPassword);
      if (keys.length === 0) {
        toast.info('No keys found');
      } else {
        setRetrievedKeys(keys);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleUseKey = (id: string) => {
    setAccessKey(id);
    toast.success('Key set');
    onOpenChange(false);
    onConfigured?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Access Key</DialogTitle>
          <DialogDescription>
            Configure the key ID used to authenticate with Stash.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key-id">Key ID</Label>
            <div className="flex gap-2">
              <Input
                id="key-id"
                placeholder="Paste a key ID…"
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                className="font-mono text-sm"
                autoFocus
              />
              <Button onClick={handleSave} disabled={!keyId.trim()}>
                Use
              </Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Retrieve with admin password</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Admin password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                className="text-sm"
              />
              <Button
                variant="outline"
                onClick={handleUnlock}
                disabled={unlockLoading}
                className="shrink-0"
              >
                {unlockLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Retrieve
              </Button>
            </div>
          </div>

          {retrievedKeys.length > 0 && (
            <div className="space-y-1 rounded-md border p-2">
              {retrievedKeys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{k.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{k.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={k.isActive ? 'default' : 'secondary'} className="text-[10px]">
                      {k.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleUseKey(k.id)}
                    >
                      Use
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
