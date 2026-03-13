import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import { deviceApi, tagApi, type Device, type Tag } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Edit,
  Plus,
  Search,
  Tags,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const PAGE_SIZE = 25;

const DATA_TYPES = [
  'boolean',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'float32',
  'float64',
  'string',
] as const;
const ACCESS_MODES = ['read', 'write', 'readwrite'] as const;

const accessModeLabels: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  readwrite: 'Read/Write',
};

const accessModeColors: Record<string, string> = {
  read: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  write: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  readwrite: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
};

export function TagsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [dataTypeFilter, setDataTypeFilter] = useState('');
  const [accessModeFilter, setAccessModeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Fetch all devices for the device filter dropdown and name lookups
  const { data: devicesData } = useQuery({
    queryKey: ['devices', { limit: 500 }],
    queryFn: () => deviceApi.list({ limit: 500 }),
  });

  const deviceMap = useMemo(() => {
    const map = new Map<string, Device>();
    for (const d of devicesData?.data ?? []) {
      map.set(d.id, d);
    }
    return map;
  }, [devicesData]);

  // Fetch tags
  const {
    data: tagsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'tags',
      { search, deviceId: deviceFilter, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    ],
    queryFn: () =>
      tagApi.list({
        search: search || undefined,
        deviceId: deviceFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tagApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({ title: 'Tag deleted', description: 'Tag removed successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete tag', variant: 'destructive' });
    },
  });

  const allTags = tagsData?.data ?? [];
  const totalTags = tagsData?.total ?? 0;

  // Client-side filters for data type and access mode (server may not support these)
  const filteredTags = useMemo(() => {
    let result = allTags;
    if (dataTypeFilter) {
      result = result.filter((t) => t.dataType === dataTypeFilter);
    }
    if (accessModeFilter) {
      result = result.filter((t) => t.accessMode === accessModeFilter);
    }
    return result;
  }, [allTags, dataTypeFilter, accessModeFilter]);

  const totalPages = Math.max(1, Math.ceil(totalTags / PAGE_SIZE));
  const showingFrom = totalTags === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min((page + 1) * PAGE_SIZE, totalTags);

  const handleDelete = (tag: Tag) => {
    if (confirm(`Delete tag "${tag.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(tag.id);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) {
      return <ChevronUp className="h-3 w-3 text-muted-foreground/30" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3 w-3 text-muted-foreground" />
    ) : (
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Page Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Tags</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Browse and manage data points across all connected devices
              </p>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Tag
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mt-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search tags by name or address..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="pl-9"
              />
            </div>

            {/* Device Filter */}
            <select
              value={deviceFilter}
              onChange={(e) => {
                setDeviceFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Devices</option>
              {(devicesData?.data ?? []).map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>

            {/* Data Type Filter */}
            <select
              value={dataTypeFilter}
              onChange={(e) => setDataTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Data Types</option>
              {DATA_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>

            {/* Access Mode Filter */}
            <select
              value={accessModeFilter}
              onChange={(e) => setAccessModeFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Access Modes</option>
              {ACCESS_MODES.map((am) => (
                <option key={am} value={am}>
                  {accessModeLabels[am]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg font-medium">Failed to load tags</p>
            <p className="text-sm mt-1">Check that Gateway Core is running</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filteredTags.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Tags className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No tags found</p>
            <p className="text-sm mt-1">
              {search || deviceFilter || dataTypeFilter || accessModeFilter
                ? 'Try adjusting your filters'
                : 'Get started by adding tags to your devices'}
            </p>
            {!search && !deviceFilter && !dataTypeFilter && !accessModeFilter && (
              <Button className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Add Tag
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30 text-left">
                  <th
                    className="px-6 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1.5">
                      Tag Name
                      <SortIcon column="name" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('device')}
                  >
                    <div className="flex items-center gap-1.5">
                      Device
                      <SortIcon column="device" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('address')}
                  >
                    <div className="flex items-center gap-1.5">
                      Address
                      <SortIcon column="address" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('dataType')}
                  >
                    <div className="flex items-center gap-1.5">
                      Data Type
                      <SortIcon column="dataType" />
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => handleSort('accessMode')}
                  >
                    <div className="flex items-center gap-1.5">
                      Access Mode
                      <SortIcon column="accessMode" />
                    </div>
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Units</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-center">
                    Enabled
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  : filteredTags.map((tag, index) => {
                      const device = deviceMap.get(tag.deviceId);
                      return (
                        <tr
                          key={tag.id}
                          className={cn(
                            'border-b border-border/30 transition-colors hover:bg-muted/20',
                            index % 2 === 1 && 'bg-muted/5'
                          )}
                        >
                          {/* Tag Name */}
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <Link
                                to={`/tags/${tag.id}`}
                                className="font-medium text-foreground hover:text-primary hover:underline transition-colors"
                              >
                                {tag.name}
                              </Link>
                              {tag.description && (
                                <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {tag.description}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Device */}
                          <td className="px-6 py-3">
                            {device ? (
                              <Link
                                to={`/devices/${tag.deviceId}`}
                                className="text-sm text-primary hover:underline"
                              >
                                {device.name}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground text-xs font-mono">
                                {tag.deviceId.slice(0, 8)}...
                              </span>
                            )}
                          </td>

                          {/* Address */}
                          <td className="px-6 py-3">
                            <code className="text-xs font-mono bg-muted/40 px-2 py-0.5 rounded">
                              {tag.address}
                            </code>
                          </td>

                          {/* Data Type */}
                          <td className="px-6 py-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              {tag.dataType}
                            </Badge>
                          </td>

                          {/* Access Mode */}
                          <td className="px-6 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                                accessModeColors[tag.accessMode]
                              )}
                            >
                              {accessModeLabels[tag.accessMode]}
                            </span>
                          </td>

                          {/* Units */}
                          <td className="px-6 py-3 text-muted-foreground text-sm">
                            {tag.engineeringUnits ?? '\u2014'}
                          </td>

                          {/* Enabled */}
                          <td className="px-6 py-3 text-center">
                            <span
                              className={cn(
                                'inline-block h-2.5 w-2.5 rounded-full',
                                tag.enabled
                                  ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                                  : 'bg-zinc-600'
                              )}
                              title={tag.enabled ? 'Enabled' : 'Disabled'}
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit tag"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(tag)}
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete tag"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalTags > 0 && (
        <div className="border-t border-border/40 bg-card/50 px-6 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {showingFrom}&ndash;{showingTo} of {totalTags} tags
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/30 animate-pulse">
      <td className="px-6 py-3">
        <div className="space-y-1.5">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-3 w-48 rounded bg-muted/60" />
        </div>
      </td>
      <td className="px-6 py-3">
        <div className="h-4 w-24 rounded bg-muted" />
      </td>
      <td className="px-6 py-3">
        <div className="h-5 w-28 rounded bg-muted" />
      </td>
      <td className="px-6 py-3">
        <div className="h-5 w-16 rounded bg-muted" />
      </td>
      <td className="px-6 py-3">
        <div className="h-5 w-20 rounded bg-muted" />
      </td>
      <td className="px-6 py-3">
        <div className="h-4 w-10 rounded bg-muted" />
      </td>
      <td className="px-6 py-3 text-center">
        <div className="h-2.5 w-2.5 rounded-full bg-muted mx-auto" />
      </td>
      <td className="px-6 py-3">
        <div className="flex justify-end gap-1">
          <div className="h-7 w-7 rounded bg-muted" />
          <div className="h-7 w-7 rounded bg-muted" />
        </div>
      </td>
    </tr>
  );
}
