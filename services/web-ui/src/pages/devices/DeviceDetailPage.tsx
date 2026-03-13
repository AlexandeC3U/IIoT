import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toaster';
import {
  deviceApi,
  tagApi,
  type SetupStatus,
  type Tag,
} from '@/lib/api';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Edit,
  Loader2,
  Plug,
  Power,
  Settings,
  Tag as TagIcon,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DeviceDialog } from './DeviceDialog';
import { TagDialog } from './TagDialog';

// ---------------------------------------------------------------------------
// Setup status stepper
// ---------------------------------------------------------------------------

const SETUP_STEPS: { key: SetupStatus; label: string }[] = [
  { key: 'created', label: 'Created' },
  { key: 'connected', label: 'Connected' },
  { key: 'configured', label: 'Configured' },
  { key: 'active', label: 'Active' },
];

function SetupStepper({ current }: { current: SetupStatus }) {
  const currentIdx = SETUP_STEPS.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-1.5">
      {SETUP_STEPS.map((step, idx) => {
        const filled = idx <= currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1.5">
            <div
              className={cn(
                'h-2.5 w-2.5 rounded-full transition-colors',
                filled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
              )}
              title={step.label}
            />
            {idx < SETUP_STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-4',
                  idx < currentIdx ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                )}
              />
            )}
          </div>
        );
      })}
      <span className="ml-2 text-xs text-muted-foreground capitalize">{current}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  // ---- Queries ----

  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['device', id],
    queryFn: () => deviceApi.get(id!, true),
    enabled: !!id,
  });

  // ---- Mutations ----

  const testMutation = useMutation({
    mutationFn: () => deviceApi.testConnection(id!),
    onSuccess: (result) => {
      toast({
        title: result.success ? 'Connection successful' : 'Connection failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to test connection', variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: () => deviceApi.toggle(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast({ title: 'Device toggled', description: 'Device status updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to toggle device', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deviceApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      toast({ title: 'Device deleted', description: 'Device removed successfully' });
      navigate('/devices');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete device', variant: 'destructive' });
    },
  });

  const tagToggleMutation = useMutation({
    mutationFn: (tagId: string) => tagApi.toggle(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to toggle tag', variant: 'destructive' });
    },
  });

  const tagDeleteMutation = useMutation({
    mutationFn: (tagId: string) => tagApi.delete(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] });
      toast({ title: 'Tag deleted', description: 'Tag removed successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete tag', variant: 'destructive' });
    },
  });

  // ---- Loading / Error states ----

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-3.5rem)] text-muted-foreground">
        <p className="text-lg font-medium">Device not found</p>
        <p className="text-sm mt-1">The device may have been deleted or the ID is invalid.</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate('/devices')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Devices
        </Button>
      </div>
    );
  }

  const tags = device.tags ?? [];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="border-b border-border/40 bg-card/50">
        <div className="px-6 py-4">
          {/* Top row: back + name + badges */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/devices')}
                className="p-1.5 -ml-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to devices"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold">{device.name}</h1>
                  <Badge variant={device.protocol}>{device.protocol.toUpperCase()}</Badge>
                  <Badge variant={device.status}>{device.status}</Badge>
                </div>

                {device.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{device.description}</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={testMutation.isPending}
                onClick={() => testMutation.mutate()}
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                Test Connection
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate()}
              >
                <Power className="h-4 w-4" />
                {device.enabled ? 'Disable' : 'Enable'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setEditOpen(true)}
              >
                <Edit className="h-4 w-4" />
                Edit
              </Button>

              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm(`Delete "${device.name}"? This will also delete all its tags.`)) {
                    deleteMutation.mutate();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
          </div>

          {/* Setup stepper */}
          <div className="mt-3">
            <SetupStepper current={device.setupStatus} />
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Tabs                                                              */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="px-6 py-4">
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-1.5">
              <TagIcon className="h-3.5 w-3.5" />
              Tags
              {tags.length > 0 && (
                <span className="ml-1 text-xs bg-muted-foreground/20 rounded-full px-1.5">
                  {tags.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="configuration" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Configuration
            </TabsTrigger>
          </TabsList>

          {/* ============================================================= */}
          {/* Overview Tab                                                   */}
          {/* ============================================================= */}
          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              {/* Connection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-muted-foreground" />
                    Connection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Host" value={device.host} mono />
                    <InfoRow label="Port" value={String(device.port)} mono />
                    <InfoRow label="Protocol" value={device.protocol.toUpperCase()} />
                  </dl>
                </CardContent>
              </Card>

              {/* Configuration */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow label="Poll Interval" value={`${device.pollIntervalMs}ms`} mono />
                    <InfoRow label="UNS Prefix" value={device.unsPrefix ?? '--'} mono />
                    <InfoRow label="Config Version" value={String(device.configVersion)} />
                  </dl>
                </CardContent>
              </Card>

              {/* Status */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {device.status === 'online' ? (
                      <Wifi className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <InfoRow
                      label="Current"
                      value={
                        <Badge variant={device.status} className="text-xs">
                          {device.status}
                        </Badge>
                      }
                    />
                    <InfoRow
                      label="Last Seen"
                      value={device.lastSeen ? formatRelativeTime(device.lastSeen) : 'Never'}
                    />
                    {device.lastError && (
                      <div>
                        <dt className="text-muted-foreground">Last Error</dt>
                        <dd className="mt-0.5 text-red-400 font-mono text-xs break-all">
                          {device.lastError}
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>

              {/* Metadata */}
              {Object.keys(device.metadata).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Metadata</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs font-mono bg-background/50 rounded-md p-3 overflow-auto max-h-48 text-muted-foreground">
                      {JSON.stringify(device.metadata, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ============================================================= */}
          {/* Tags Tab                                                       */}
          {/* ============================================================= */}
          <TabsContent value="tags">
            <div className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {tags.length} tag{tags.length !== 1 ? 's' : ''} configured
                </h2>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setSelectedTag(null);
                    setTagDialogOpen(true);
                  }}
                >
                  <TagIcon className="h-4 w-4" />
                  Add Tag
                </Button>
              </div>

              {tags.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <TagIcon className="h-10 w-10 mb-3 opacity-40" />
                  <p className="text-sm font-medium">No tags configured</p>
                  <p className="text-xs mt-1">
                    Add tags to start collecting data from this device.
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Address
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Data Type
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Access
                        </th>
                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          Eng. Units
                        </th>
                        <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">
                          Enabled
                        </th>
                        <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((tag) => (
                        <TagRow
                          key={tag.id}
                          tag={tag}
                          onEdit={() => {
                            setSelectedTag(tag);
                            setTagDialogOpen(true);
                          }}
                          onToggle={() => tagToggleMutation.mutate(tag.id)}
                          onDelete={() => {
                            if (confirm(`Delete tag "${tag.name}"?`)) {
                              tagDeleteMutation.mutate(tag.id);
                            }
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ============================================================= */}
          {/* Configuration Tab                                              */}
          {/* ============================================================= */}
          <TabsContent value="configuration">
            <div className="mt-4 space-y-6">
              {/* Protocol config JSON */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Protocol Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.keys(device.protocolConfig).length > 0 ? (
                    <pre className="text-xs font-mono bg-background/50 rounded-md p-4 overflow-auto max-h-64 text-muted-foreground">
                      {JSON.stringify(device.protocolConfig, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No protocol-specific configuration set.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Device settings summary */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Device Settings</CardTitle>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
                      <Edit className="h-4 w-4" />
                      Edit Settings
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <InfoRow label="Name" value={device.name} />
                    <InfoRow label="Protocol" value={device.protocol.toUpperCase()} />
                    <InfoRow label="Host" value={device.host} mono />
                    <InfoRow label="Port" value={String(device.port)} mono />
                    <InfoRow label="Poll Interval" value={`${device.pollIntervalMs}ms`} mono />
                    <InfoRow label="Location" value={device.location ?? '--'} />
                    <InfoRow label="UNS Prefix" value={device.unsPrefix ?? '--'} mono />
                    <InfoRow
                      label="Enabled"
                      value={
                        <span className={device.enabled ? 'text-emerald-400' : 'text-muted-foreground'}>
                          {device.enabled ? 'Yes' : 'No'}
                        </span>
                      }
                    />
                    <InfoRow label="Created" value={formatDate(device.createdAt)} />
                    <InfoRow label="Updated" value={formatDate(device.updatedAt)} />
                  </dl>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Edit Dialog                                                       */}
      {/* ----------------------------------------------------------------- */}
      <DeviceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        device={device}
        onSuccess={() => {
          setEditOpen(false);
          queryClient.invalidateQueries({ queryKey: ['device', id] });
          queryClient.invalidateQueries({ queryKey: ['devices'] });
        }}
      />

      <TagDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        deviceId={device.id}
        protocol={device.protocol}
        tag={selectedTag}
        onSuccess={() => {
          setTagDialogOpen(false);
          setSelectedTag(null);
          queryClient.invalidateQueries({ queryKey: ['device', id] });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Info row for dl lists
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className={cn('text-right truncate', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: Tag table row
// ---------------------------------------------------------------------------

function TagRow({
  tag,
  onEdit,
  onToggle,
  onDelete,
}: {
  tag: Tag;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-2.5">
        <div>
          <span className="font-medium">{tag.name}</span>
          {tag.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
              {tag.description}
            </p>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{tag.address}</td>
      <td className="px-4 py-2.5">
        <Badge variant="secondary" className="text-xs">
          {tag.dataType}
        </Badge>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize">{tag.accessMode}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {tag.engineeringUnits ?? '--'}
      </td>
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={onToggle}
          className={cn(
            'inline-flex h-5 w-9 items-center rounded-full transition-colors',
            tag.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
          )}
        >
          <span
            className={cn(
              'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
              tag.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
            )}
          />
        </button>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Edit tag"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="Delete tag"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
