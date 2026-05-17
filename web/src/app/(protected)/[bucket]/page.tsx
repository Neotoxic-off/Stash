'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  Download, Trash2, RefreshCw, ChevronRight, ChevronDown,
  Loader2, CircleAlert, Database, X, Link2,
  ChevronLeft, ChevronRight as ChevronRightIcon, Copy,
  Upload, FolderPlus,
} from 'lucide-react';
import {
  FolderIcon, DocumentIcon, DocumentTextIcon, PhotoIcon,
  FilmIcon, MusicalNoteIcon, CodeBracketIcon, ArchiveBoxIcon,
  BookOpenIcon,
} from '@heroicons/react/24/solid';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UploadZone } from '@/components/UploadZone';
import { api, formatBytes, formatDate, fileIcon, isConfigured } from '@/lib/api';
import type { S3Object } from '@/lib/types';

const FILE_ICONS: Record<string, React.ElementType> = {
  image: PhotoIcon, video: FilmIcon, audio: MusicalNoteIcon,
  text: DocumentTextIcon, code: CodeBracketIcon, archive: ArchiveBoxIcon,
  file: DocumentIcon, pdf: BookOpenIcon,
};

const PAGE_SIZES = [20, 50, 100] as const;

export default function BucketPage() {
  const params = useParams<{ bucket: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const bucket = decodeURIComponent(params.bucket ?? '');
  const prefix = searchParams.get('prefix') ?? '';

  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentToken, setCurrentToken] = useState<string | undefined>(undefined);
  const [tokenHistory, setTokenHistory] = useState<(string | undefined)[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const isFirstPage = tokenHistory.length === 0;
  const hasNextPage = Boolean(nextToken);

  // Selection
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Single delete
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);

  // Page size dropdown
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pageSizeOpen) return;
    function onOutside(e: MouseEvent) {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node))
        setPageSizeOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [pageSizeOpen]);

  // Create folder dialog
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listObjects(bucket, prefix, '/', pageSize, currentToken);
      setFolders(result.commonPrefixes);
      setFiles(result.contents);
      setNextToken(result.nextContinuationToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load objects');
    } finally {
      setLoading(false);
    }
  }, [bucket, prefix, pageSize, currentToken]);

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) await api.autoConfigureKey();
      if (!isConfigured()) { router.replace('/'); return; }
      load();
    };
    init();
  }, [load, router]);

  // Reset pagination when prefix/bucket changes
  useEffect(() => {
    setCurrentToken(undefined);
    setTokenHistory([]);
    setNextToken(undefined);
    setSelectedKeys(new Set());
    setSelectedFolders(new Set());
  }, [bucket, prefix]);

  // Sync select-all indeterminate state
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedKeys.size > 0 && selectedKeys.size < files.length;
    }
  }, [selectedKeys, files.length]);

  // Drop stale selections after reload
  useEffect(() => {
    if (selectedKeys.size === 0) return;
    const alive = new Set(files.map((f) => f.key));
    setSelectedKeys((prev) => {
      const next = new Set([...prev].filter((k) => alive.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateToPrefix = (newPrefix: string) => {
    setSelectedKeys(new Set());
    setSelectedFolders(new Set());
    setCurrentToken(undefined);
    setTokenHistory([]);
    const url = newPrefix ? `/${bucket}?prefix=${encodeURIComponent(newPrefix)}` : `/${bucket}`;
    router.push(url);
  };

  const goNextPage = () => {
    setTokenHistory((h) => [...h, currentToken]);
    setCurrentToken(nextToken);
    setSelectedKeys(new Set());
    setSelectedFolders(new Set());
  };

  const goPrevPage = () => {
    setTokenHistory((h) => {
      const next = [...h];
      setCurrentToken(next.pop());
      return next;
    });
    setSelectedKeys(new Set());
    setSelectedFolders(new Set());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteObject(bucket, deleteTarget);
      toast.success('Deleted');
      setFiles((prev) => prev.filter((f) => f.key !== deleteTarget));
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    const keys = [...selectedKeys];
    const folderPrefixes = [...selectedFolders];
    setBulkDeleting(true);
    try {
      await Promise.all([
        ...keys.map((key) => api.deleteObject(bucket, key)),
        ...folderPrefixes.map((fp) => api.deletePrefix(bucket, fp)),
      ]);
      const parts: string[] = [];
      if (keys.length > 0) parts.push(`${keys.length} file${keys.length !== 1 ? 's' : ''}`);
      if (folderPrefixes.length > 0) parts.push(`${folderPrefixes.length} folder${folderPrefixes.length !== 1 ? 's' : ''}`);
      toast.success(`Deleted ${parts.join(' and ')}`);
      setFiles((prev) => prev.filter((f) => !selectedKeys.has(f.key)));
      setFolders((prev) => prev.filter((f) => !selectedFolders.has(f)));
      setSelectedKeys(new Set());
      setSelectedFolders(new Set());
      setBulkDeleteOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete some items');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = folderName.trim().replace(/\/+/g, '').replace(/\s+/g, '-');
    if (!name) return;
    setCreatingFolder(true);
    try {
      await api.uploadObject(bucket, `${prefix}${name}/.keep`, new Blob([]));
      toast.success(`Folder "${name}" created`);
      setNewFolderOpen(false);
      setFolderName('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const toggleKey = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const breadcrumbs = (() => {
    if (!prefix) return [];
    const parts = prefix.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      prefix: parts.slice(0, i + 1).join('/') + '/',
    }));
  })();

  const totalSelected = selectedKeys.size + selectedFolders.size;
  const isEmpty = !loading && !error && folders.length === 0 && files.length === 0;
  const pageNum = tokenHistory.length + 1;

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Header row: breadcrumb + action buttons */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <nav className="flex items-center gap-1 text-sm mr-auto min-w-0 overflow-hidden">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              Buckets
            </Link>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            <button
              onClick={() => navigateToPrefix('')}
              className="font-semibold hover:text-primary transition-colors shrink-0"
            >
              {bucket}
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.prefix} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                {i === breadcrumbs.length - 1 ? (
                  <span className="font-medium truncate">{crumb.label}</span>
                ) : (
                  <button
                    onClick={() => navigateToPrefix(crumb.prefix)}
                    className="text-muted-foreground hover:text-foreground transition-colors truncate"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => { setFolderName(''); setNewFolderOpen(true); }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </Button>
          </div>
        </div>

        {/* Secondary toolbar: stats / selection actions / page controls */}
        <div className="mb-3 flex items-center gap-2">
          <span className="flex-1 text-xs text-muted-foreground">
            {totalSelected > 0 ? (
              <>{totalSelected} selected</>
            ) : (
              <>
                {folders.length > 0 && <>{folders.length} folder{folders.length !== 1 ? 's' : ''}, </>}
                {files.length} file{files.length !== 1 ? 's' : ''}
                {pageNum > 1 && <span className="ml-1 opacity-50">· page {pageNum}</span>}
              </>
            )}
          </span>

          {totalSelected > 0 && (
            <>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Delete {totalSelected}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => { setSelectedKeys(new Set()); setSelectedFolders(new Set()); }}
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            </>
          )}

          <div ref={pageSizeRef} className="relative">
            <button
              onClick={() => setPageSizeOpen((v) => !v)}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground font-mono hover:bg-muted transition-colors focus:outline-none"
            >
              {pageSize} / page
              <ChevronDown className="h-3 w-3 opacity-50" />
            </button>
            {pageSizeOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setPageSize(s);
                      setCurrentToken(undefined);
                      setTokenHistory([]);
                      setPageSizeOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-accent/50 transition-colors ${
                      s === pageSize ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {s} / page
                  </button>
                ))}
              </div>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </div>

        {error && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <CircleAlert className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {loading && folders.length === 0 && files.length === 0 && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
            <Database className="mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium">Empty</p>
            <p className="mt-1 text-xs text-muted-foreground">Upload files or create a folder to get started.</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </Button>
          </div>
        )}

        {(folders.length > 0 || files.length > 0) && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-8 px-3 py-2.5">
                    {files.length > 0 && (
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer"
                        checked={selectedKeys.size === files.length && files.length > 0}
                        onChange={(e) =>
                          setSelectedKeys(e.target.checked ? new Set(files.map((f) => f.key)) : new Set())
                        }
                      />
                    )}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="hidden px-4 py-2.5 text-right text-xs font-medium text-muted-foreground sm:table-cell">Size</th>
                  <th className="hidden px-4 py-2.5 text-right text-xs font-medium text-muted-foreground md:table-cell">Modified</th>
                  <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground xl:table-cell">SHA-256</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {folders.map((fp) => {
                  const name = fp.slice(prefix.length).replace(/\/$/, '');
                  const folderChecked = selectedFolders.has(fp);
                  return (
                    <tr
                      key={fp}
                      className={`group transition-colors ${folderChecked ? 'bg-primary/5' : 'hover:bg-accent/5'}`}
                    >
                      <td className="w-8 px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer"
                          checked={folderChecked}
                          onChange={(e) => {
                            setSelectedFolders((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(fp); else next.delete(fp);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td
                        className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer"
                        onClick={() => navigateToPrefix(fp)}
                      >
                        <FolderIcon className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="font-medium">{name}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right text-muted-foreground sm:table-cell">—</td>
                      <td className="hidden px-4 py-2.5 text-right text-muted-foreground md:table-cell">—</td>
                      <td className="hidden px-4 py-2.5 xl:table-cell" />
                      <td className="px-4 py-2.5" />
                    </tr>
                  );
                })}

                {files.map((obj) => {
                  const name = obj.key.slice(prefix.length);
                  const IconComponent = FILE_ICONS[fileIcon(obj.key)] ?? File;
                  const checked = selectedKeys.has(obj.key);

                  return (
                    <tr
                      key={obj.key}
                      className={`group hover:bg-accent/5 transition-colors ${checked ? 'bg-primary/5' : ''}`}
                    >
                      <td className="w-8 px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer"
                          checked={checked}
                          onChange={(e) => toggleKey(obj.key, e.target.checked)}
                        />
                      </td>
                      <td className="flex items-center gap-2.5 px-4 py-2.5">
                        <IconComponent className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                        <span className="truncate max-w-[14rem] md:max-w-xs">{name}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                        {formatBytes(obj.size)}
                      </td>
                      <td className="hidden px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap md:table-cell">
                        {formatDate(obj.lastModified)}
                      </td>
                      <td className="hidden px-4 py-2.5 xl:table-cell">
                        {obj.sha256 ? (
                          <Tooltip>
                            <TooltipTrigger
                              className="flex items-center gap-1.5 cursor-copy group/hash"
                              onClick={(e) => {
                                e.stopPropagation();
                                void navigator.clipboard.writeText(obj.sha256!);
                                toast.success('SHA-256 copied');
                              }}
                            >
                              <span className="font-mono text-[10px] text-muted-foreground/60 group-hover/hash:text-muted-foreground transition-colors">
                                {obj.sha256.slice(0, 16)}…
                              </span>
                              <Copy className="h-3 w-3 text-muted-foreground/30 group-hover/hash:text-muted-foreground/60 transition-colors shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent className="font-mono text-[10px] max-w-xs break-all">
                              {obj.sha256}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Tooltip>
                            <TooltipTrigger
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
                              onClick={async () => {
                                try {
                                  const url = await api.createPresignedUrl(bucket, obj.key, 300);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.click();
                                } catch {
                                  toast.error('Failed to generate download link');
                                }
                              }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Download (5 min link)</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
                              onClick={async () => {
                                try {
                                  const url = await api.createPresignedUrl(bucket, obj.key, 3600);
                                  await navigator.clipboard.writeText(window.location.origin + url);
                                  toast.success('Link copied — valid 1 hour');
                                } catch {
                                  toast.error('Failed to generate link');
                                }
                              }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Copy share link (1 h)</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                              onClick={() => setDeleteTarget(obj.key)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(!isFirstPage || hasNextPage) && (
              <div className="flex items-center justify-between border-t px-4 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Page {pageNum} · {files.length} file{files.length !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={isFirstPage || loading}
                    onClick={goPrevPage}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={!hasNextPage || loading}
                    onClick={goNextPage}
                  >
                    Next
                    <ChevronRightIcon className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload files</DialogTitle>
            <DialogDescription>
              {prefix
                ? <>Destination: <span className="font-mono text-xs">{prefix}</span></>
                : 'Uploading to bucket root'}
            </DialogDescription>
          </DialogHeader>
          <UploadZone bucket={bucket} prefix={prefix} onUploaded={load} />
        </DialogContent>
      </Dialog>

      {/* Create folder dialog */}
      <Dialog
        open={newFolderOpen}
        onOpenChange={(o) => { if (!o) { setNewFolderOpen(false); setFolderName(''); } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>
              Creates a folder under <span className="font-mono text-xs">{prefix || '/'}</span>
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="folder-name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !creatingFolder) void handleCreateFolder(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewFolderOpen(false); setFolderName(''); }}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFolder()} disabled={!folderName.trim() || creatingFolder}>
              {creatingFolder && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single delete */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete object</DialogTitle>
            <DialogDescription>
              Delete <span className="font-mono text-xs">{deleteTarget?.split('/').pop()}</span>? This cannot be undone.
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

      {/* Bulk delete */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => !o && setBulkDeleteOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {totalSelected} item{totalSelected !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              {selectedKeys.size > 0 && (
                <>{selectedKeys.size} file{selectedKeys.size !== 1 ? 's' : ''}{selectedFolders.size > 0 ? ' and ' : ''}</>
              )}
              {selectedFolders.size > 0 && (
                <>{selectedFolders.size} folder{selectedFolders.size !== 1 ? 's' : ''} (including all contents)</>
              )}
              {' '}will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Delete {totalSelected}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
