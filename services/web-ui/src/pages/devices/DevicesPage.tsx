import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { deviceApi, type Device, type DeviceQuery } from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { DeviceDialog } from './DeviceDialog';

const protocolColors: Record<string, string> = {
  modbus: 'protocol-badge-modbus',
  opcua: 'protocol-badge-opcua',
  s7: 'protocol-badge-s7',
};

const statusColors: Record<string, string> = {
  online: 'status-dot-online',
  offline: 'status-dot-offline',
  error: 'status-dot-error',
  unknown: 'status-dot-unknown',
};

export function DevicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<DeviceQuery['protocol']>();
  const [statusFilter, setStatusFilter] = useState<DeviceQuery['status']>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['devices', { search, protocol: protocolFilter, status: statusFilter }],
    queryFn: () =>
      deviceApi.list({
        search: search || undefined,
        protocol: protocolFilter,
        status: statusFilter,
        limit: 100,
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => deviceApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast({ title: 'Device toggled', description: 'Device status updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to toggle device', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deviceApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast({ title: 'Device deleted', description: 'Device removed successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete device', variant: 'destructive' });
    },
  });

  const handleEdit = (device: Device) => {
    setSelectedDevice(device);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedDevice(null);
    setDialogOpen(true);
  };

  const devices = data?.data ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Page Header */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Devices</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage connected industrial devices and their configurations
              </p>
            </div>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Device
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mt-4">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search devices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Protocol Filter */}
            <select
              value={protocolFilter ?? ''}
              onChange={(e) =>
                setProtocolFilter((e.target.value || undefined) as DeviceQuery['protocol'])
              }
              className="px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Protocols</option>
              <option value="modbus">Modbus</option>
              <option value="opcua">OPC UA</option>
              <option value="s7">S7</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter ?? ''}
              onChange={(e) =>
                setStatusFilter((e.target.value || undefined) as DeviceQuery['status'])
              }
              className="px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="error">Error</option>
              <option value="unknown">Unknown</option>
            </select>

            {/* Refresh */}
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      {/* Device Grid */}
      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg font-medium">Failed to load devices</p>
            <p className="text-sm mt-1">Check that Gateway Core is running</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : devices.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-lg font-medium">No devices found</p>
            <p className="text-sm mt-1">Get started by adding your first device</p>
            <Button className="mt-4 gap-2" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              Add Device
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <DeviceCardSkeleton key={i} />)
              : devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onEdit={() => handleEdit(device)}
                    onToggle={() => toggleMutation.mutate(device.id)}
                    onDelete={() => {
                      if (confirm(`Delete "${device.name}"? This will also delete all its tags.`)) {
                        deleteMutation.mutate(device.id);
                      }
                    }}
                  />
                ))}
          </div>
        )}
      </div>

      {/* Device Dialog */}
      <DeviceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        device={selectedDevice}
        onSuccess={() => {
          setDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ['devices'] });
        }}
      />
    </div>
  );
}

interface DeviceCardProps {
  device: Device;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function DeviceCard({ device, onEdit, onToggle, onDelete }: DeviceCardProps) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-lg border bg-card p-4 transition-all hover:shadow-md',
        !device.enabled && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('status-dot', statusColors[device.status])} />
          <span className={cn('protocol-badge', protocolColors[device.protocol])}>
            {device.protocol}
          </span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title={device.enabled ? 'Disable' : 'Enable'}
          >
            <Power className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Name & Description */}
      <div className="mt-3">
        <h3 className="font-semibold text-sm truncate">{device.name}</h3>
        {device.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{device.description}</p>
        )}
      </div>

      {/* Connection Info */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="text-xs text-muted-foreground font-mono">
          {device.host}:{device.port}
        </div>
        {device.location && (
          <div className="text-xs text-muted-foreground mt-1 truncate">{device.location}</div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto pt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{device.pollIntervalMs}ms poll</span>
        {device.lastSeen && <span>{formatRelativeTime(device.lastSeen)}</span>}
      </div>

      {/* Error indicator */}
      {device.lastError && (
        <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs truncate">
          {device.lastError}
        </div>
      )}
    </div>
  );
}

function DeviceCardSkeleton() {
  return (
    <div className="flex flex-col rounded-lg border bg-card p-4 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-muted" />
        <div className="w-16 h-5 rounded bg-muted" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="w-3/4 h-4 rounded bg-muted" />
        <div className="w-full h-3 rounded bg-muted" />
      </div>
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="w-1/2 h-3 rounded bg-muted" />
      </div>
    </div>
  );
}

