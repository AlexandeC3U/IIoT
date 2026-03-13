import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toaster';
import {
  deviceApi,
  type Device,
  type DeviceQuery,
  type DeviceStatus,
  type Protocol,
  type SetupStatus,
} from '@/lib/api';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  Edit,
  Eye,
  Plus,
  Power,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeviceDialog } from './DeviceDialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: 'modbus', label: 'Modbus' },
  { value: 'opcua', label: 'OPC UA' },
  { value: 's7', label: 'S7' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'bacnet', label: 'BACnet' },
  { value: 'ethernetip', label: 'EtherNet/IP' },
];

const STATUS_OPTIONS: { value: DeviceStatus; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'error', label: 'Error' },
  { value: 'unknown', label: 'Unknown' },
];

const SETUP_STEPS: { key: SetupStatus; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'connected', label: 'Connected' },
  { key: 'configured', label: 'Configured' },
  { key: 'active', label: 'Active' },
];

const STATUS_DOT_COLORS: Record<DeviceStatus, string> = {
  online: 'bg-emerald-400 shadow-emerald-400/40',
  offline: 'bg-slate-400 shadow-slate-400/20',
  error: 'bg-red-400 shadow-red-400/40',
  unknown: 'bg-yellow-400 shadow-yellow-400/30',
};

const PROTOCOL_LABELS: Record<Protocol, string> = {
  modbus: 'Modbus',
  opcua: 'OPC UA',
  s7: 'S7',
  mqtt: 'MQTT',
  bacnet: 'BACnet',
  ethernetip: 'EtherNet/IP',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DevicesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<DeviceQuery['protocol']>();
  const [statusFilter, setStatusFilter] = useState<DeviceQuery['status']>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  // --- Data fetching -------------------------------------------------------

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

  // --- Mutations -----------------------------------------------------------

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

  // --- Handlers ------------------------------------------------------------

  const handleEdit = (device: Device) => {
    setSelectedDevice(device);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedDevice(null);
    setDialogOpen(true);
  };

  const devices = data?.data ?? [];

  // --- Render --------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Page Header */}
      <div className="border-b border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Devices</h1>
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search devices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Protocol Filter */}
            <select
              value={protocolFilter ?? ''}
              onChange={(e) =>
                setProtocolFilter((e.target.value || undefined) as DeviceQuery['protocol'])
              }
              className="h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="">All Protocols</option>
              {PROTOCOLS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter ?? ''}
              onChange={(e) =>
                setStatusFilter((e.target.value || undefined) as DeviceQuery['status'])
              }
              className="h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Refresh */}
            <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      {/* Device Grid */}
      <div className="flex-1 overflow-auto p-6">
        {error ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mb-3 text-destructive/60" />
            <p className="text-lg font-medium">Failed to load devices</p>
            <p className="text-sm mt-1">Check that Gateway Core is running</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : devices.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
              <Plus className="h-8 w-8" />
            </div>
            <p className="text-lg font-medium">No devices found</p>
            <p className="text-sm mt-1">Get started by adding your first device</p>
            <Button className="mt-4 gap-2" onClick={handleCreate}>
              <Plus className="h-4 w-4" />
              Add Device
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <DeviceCardSkeleton key={i} />)
              : devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onView={() => navigate(`/devices/${device.id}`)}
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

// ---------------------------------------------------------------------------
// Setup Status Stepper
// ---------------------------------------------------------------------------

function SetupStepper({ status }: { status: SetupStatus }) {
  const currentIdx = SETUP_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-1" title={`Setup: ${status}`}>
      {SETUP_STEPS.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-1">
          <div
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              idx <= currentIdx ? 'bg-emerald-400' : 'bg-muted-foreground/25'
            )}
          />
          {idx < SETUP_STEPS.length - 1 && (
            <div
              className={cn(
                'h-px w-2 transition-colors',
                idx < currentIdx ? 'bg-emerald-400/60' : 'bg-muted-foreground/15'
              )}
            />
          )}
        </div>
      ))}
      <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {status}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device Card
// ---------------------------------------------------------------------------

interface DeviceCardProps {
  device: Device;
  onView: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function DeviceCard({ device, onView, onEdit, onToggle, onDelete }: DeviceCardProps) {
  const tagCount = device.tags?.length;

  return (
    <div
      onClick={onView}
      className={cn(
        'group relative flex flex-col rounded-lg border border-border/60 bg-card p-4 cursor-pointer',
        'transition-all duration-200 hover:border-border hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5',
        !device.enabled && 'opacity-50'
      )}
    >
      {/* Header: Status dot + Protocol badge + Hover actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shadow-sm',
              STATUS_DOT_COLORS[device.status]
            )}
          />
          <Badge variant={device.protocol}>{PROTOCOL_LABELS[device.protocol]}</Badge>
        </div>

        {/* Hover actions */}
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onToggle}
            className={cn(
              'p-1.5 rounded-md text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground'
            )}
            title={device.enabled ? 'Disable' : 'Enable'}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            className={cn(
              'p-1.5 rounded-md text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground'
            )}
            title="Edit"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className={cn(
              'p-1.5 rounded-md text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-destructive'
            )}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Name & Description */}
      <div className="mt-3">
        <h3 className="font-semibold text-sm truncate">{device.name}</h3>
        {device.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {device.description}
          </p>
        )}
      </div>

      {/* Setup status stepper */}
      <div className="mt-2.5">
        <SetupStepper status={device.setupStatus} />
      </div>

      {/* Connection & Meta */}
      <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
        <div className="text-xs text-muted-foreground font-mono truncate">
          {device.host}:{device.port}
        </div>

        {device.location && (
          <div className="text-xs text-muted-foreground truncate">{device.location}</div>
        )}

        {tagCount !== undefined && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Tag className="h-3 w-3" />
            <span>
              {tagCount} tag{tagCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Footer: Poll interval + Last seen */}
      <div className="mt-auto pt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {device.pollIntervalMs}ms
        </span>
        {device.lastSeen && (
          <span title={new Date(device.lastSeen).toLocaleString()}>
            {formatRelativeTime(device.lastSeen)}
          </span>
        )}
      </div>

      {/* Error indicator */}
      {device.lastError && (
        <div className="mt-2 flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="truncate">{device.lastError}</span>
        </div>
      )}

      {/* View overlay hint */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none pb-2">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground bg-card/90 px-2 py-0.5 rounded-full border border-border/40">
          <Eye className="h-3 w-3" />
          View
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DeviceCardSkeleton() {
  return (
    <div className="flex flex-col rounded-lg border border-border/60 bg-card p-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="h-2.5 w-2.5 rounded-full bg-muted" />
        <div className="h-5 w-16 rounded-md bg-muted" />
      </div>
      {/* Name */}
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
      </div>
      {/* Stepper */}
      <div className="mt-2.5 flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-1.5 w-1.5 rounded-full bg-muted" />
        ))}
        <div className="ml-1.5 h-2.5 w-12 rounded bg-muted" />
      </div>
      {/* Connection */}
      <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      {/* Footer */}
      <div className="mt-auto pt-3 flex items-center justify-between">
        <div className="h-3 w-14 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
    </div>
  );
}
