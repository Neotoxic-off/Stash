'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { FolderIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { api, formatBytes } from '@/lib/api';
import type { UploadTask } from '@/lib/types';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  bucket: string;
  prefix: string;
  onUploaded: () => void;
}

export function UploadZone({ bucket, prefix, onUploaded }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [taskPage, setTaskPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 10;

  // Jump to last page whenever new tasks are added
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (tasks.length > prevLengthRef.current) {
      setTaskPage(Math.floor((tasks.length - 1) / PAGE_SIZE));
    }
    prevLengthRef.current = tasks.length;
  }, [tasks.length]);

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const uploadFile = useCallback(
    async (file: File, key: string) => {
      const id = crypto.randomUUID();
      const task: UploadTask = {
        id,
        name: file.name,
        key,
        progress: 0,
        status: 'pending',
      };
      setTasks((prev) => [...prev, task]);

      try {
        updateTask(id, { status: 'uploading' });
        await api.uploadObject(bucket, key, file, (progress) =>
          updateTask(id, { progress: Math.round(progress * 100) }),
        );
        updateTask(id, { status: 'done', progress: 100 });
        onUploaded();
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Upload failed';
        updateTask(id, { status: 'error', error });
        toast.error(`Failed: ${file.name}`);
      }
    },
    [bucket, onUploaded],
  );

  const processEntries = useCallback(
    (entries: Array<{ file: File; relativePath: string }>) => {
      for (const { file, relativePath } of entries) {
        uploadFile(file, prefix + relativePath.replace(/^\//, ''));
      }
    },
    [prefix, uploadFile],
  );

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      processEntries(
        Array.from(files).map((f) => ({
          file: f,
          relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        })),
      );
    },
    [processEntries],
  );

  const handleFolderClick = useCallback(async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const dir = await (window as typeof window & {
          showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
        }).showDirectoryPicker();

        async function collect(
          handle: FileSystemDirectoryHandle,
          path: string,
        ): Promise<Array<{ file: File; relativePath: string }>> {
          const out: Array<{ file: File; relativePath: string }> = [];
          for await (const [name, entry] of handle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
            if (entry.kind === 'file') {
              out.push({ file: await (entry as FileSystemFileHandle).getFile(), relativePath: path + name });
            } else {
              out.push(...await collect(entry as FileSystemDirectoryHandle, path + name + '/'));
            }
          }
          return out;
        }

        processEntries(await collect(dir, ''));
      } catch {
        // cancelled
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.style.display = 'none';
      input.onchange = () => {
        if (input.files) processFiles(input.files);
        document.body.removeChild(input);
      };
      document.body.appendChild(input);
      input.click();
    }
  }, [processEntries, processFiles]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };

  const clearDone = () => {
    setTasks((prev) => prev.filter((t) => t.status !== 'done'));
    setTaskPage(0);
  };

  const pageCount = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const pagedTasks = tasks.slice(taskPage * PAGE_SIZE, (taskPage + 1) * PAGE_SIZE);
  const uploadingCount = tasks.filter((t) => t.status === 'uploading').length;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const hasFinished = doneCount > 0;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 px-4 transition-colors cursor-pointer select-none',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-border/80 hover:bg-accent/5',
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="mt-1 text-xs text-muted-foreground">Any file type, any size</p>

        <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3 w-3" />
            Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleFolderClick}
          >
            <FolderIcon className="mr-1.5 h-3 w-3" />
            Folder
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
      </div>

      {/* Upload tasks */}
      {tasks.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-xs font-medium text-muted-foreground">
              {uploadingCount > 0
                ? `Uploading ${uploadingCount} file${uploadingCount !== 1 ? 's' : ''}…`
                : `${doneCount} / ${tasks.length} done`}
            </span>
            {hasFinished && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearDone}>
                <X className="mr-1 h-3 w-3" />
                Clear done
              </Button>
            )}
          </div>
          <div className="divide-y">
            {pagedTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2">
                <div className="shrink-0">
                  {task.status === 'done' && <CheckCircleIcon className="h-4 w-4 text-emerald-500" />}
                  {task.status === 'error' && <ExclamationCircleIcon className="h-4 w-4 text-destructive" />}
                  {(task.status === 'uploading' || task.status === 'pending') && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{task.name}</p>
                  {task.status === 'uploading' && (
                    <Progress value={task.progress} className="mt-1 h-1" />
                  )}
                  {task.status === 'error' && (
                    <p className="mt-0.5 text-[11px] text-destructive">{task.error}</p>
                  )}
                </div>
                {task.status === 'uploading' && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {task.progress}%
                  </span>
                )}
              </div>
            ))}
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                {taskPage * PAGE_SIZE + 1}–{Math.min((taskPage + 1) * PAGE_SIZE, tasks.length)} of {tasks.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={taskPage === 0}
                  onClick={() => setTaskPage((p) => p - 1)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  disabled={taskPage >= pageCount - 1}
                  onClick={() => setTaskPage((p) => p + 1)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
