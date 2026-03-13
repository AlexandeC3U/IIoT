import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toaster';
import { deviceApi, type CreateDeviceInput, type Device, type Protocol } from '@/lib/api';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PROTOCOL_CONFIG_COMPONENTS, getProtocolDefaults } from './protocols';

interface DeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device | null;
  onSuccess: () => void;
}

const PROTOCOLS: { value: Protocol; label: string; defaultPort: number }[] = [
  { value: 'modbus', label: 'Modbus TCP/RTU', defaultPort: 502 },
  { value: 'opcua', label: 'OPC UA', defaultPort: 4840 },
  { value: 's7', label: 'Siemens S7', defaultPort: 102 },
  { value: 'mqtt', label: 'MQTT', defaultPort: 1883 },
  { value: 'bacnet', label: 'BACnet/IP', defaultPort: 47808 },
  { value: 'ethernetip', label: 'EtherNet/IP', defaultPort: 44818 },
];

function buildInitialForm(device: Device | null): CreateDeviceInput {
  if (device) {
    return {
      name: device.name,
      description: device.description ?? '',
      protocol: device.protocol,
      host: device.host,
      port: device.port,
      pollIntervalMs: device.pollIntervalMs,
      location: device.location ?? '',
      unsPrefix: device.unsPrefix ?? '',
      enabled: device.enabled,
      protocolConfig: (device.protocolConfig ?? {}) as Record<string, unknown>,
    };
  }
  return {
    name: '',
    description: '',
    protocol: 'modbus',
    host: '',
    port: 502,
    pollIntervalMs: 1000,
    location: '',
    unsPrefix: '',
    enabled: true,
    protocolConfig: getProtocolDefaults('modbus'),
  };
}

export function DeviceDialog({ open, onOpenChange, device, onSuccess }: DeviceDialogProps) {
  const isEditing = !!device;
  const [form, setForm] = useState<CreateDeviceInput>(() => buildInitialForm(device));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when device changes or dialog opens
  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(device));
      setErrors({});
    }
  }, [open, device]);

  const updateField = useCallback(
    <K extends keyof CreateDeviceInput>(key: K, value: CreateDeviceInput[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  // When protocol changes, update port + reset protocolConfig
  const handleProtocolChange = useCallback((protocol: Protocol) => {
    const proto = PROTOCOLS.find((p) => p.value === protocol)!;
    setForm((prev) => ({
      ...prev,
      protocol,
      port: proto.defaultPort,
      protocolConfig: getProtocolDefaults(protocol),
    }));
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.host.trim()) errs.host = 'Host is required';
    if (!form.port || form.port < 1 || form.port > 65535) errs.port = 'Valid port required (1-65535)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateDeviceInput) => deviceApi.create(data),
    onSuccess: () => {
      toast({ title: 'Device created', description: 'Device added successfully' });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create device',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateDeviceInput) => deviceApi.update(device!.id, data),
    onSuccess: () => {
      toast({ title: 'Device updated', description: 'Device updated successfully' });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update device',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (isEditing) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const ProtocolConfigComponent = PROTOCOL_CONFIG_COMPONENTS[form.protocol];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[90vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Title className="text-lg font-semibold">
            {isEditing ? 'Edit Device' : 'Add Device'}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing
              ? 'Update the device configuration below.'
              : 'Configure a new device to connect to your industrial network.'}
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {/* ── General ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Name */}
              <div className="col-span-2 sm:col-span-1">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  error={!!errors.name}
                  placeholder="PLC-001"
                  className="mt-1.5"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>

              {/* Protocol */}
              <div className="col-span-2 sm:col-span-1">
                <label className="text-sm font-medium">Protocol *</label>
                <select
                  value={form.protocol}
                  onChange={(e) => handleProtocolChange(e.target.value as Protocol)}
                  disabled={isEditing}
                  className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                >
                  {PROTOCOLS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {isEditing && (
                  <p className="text-xs text-muted-foreground mt-1">Protocol cannot be changed</p>
                )}
              </div>
            </div>

            {/* ── Connection ───────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium">Host *</label>
                <Input
                  value={form.host}
                  onChange={(e) => updateField('host', e.target.value)}
                  error={!!errors.host}
                  placeholder="192.168.1.10"
                  className="mt-1.5 font-mono"
                />
                {errors.host && <p className="text-xs text-destructive mt-1">{errors.host}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Port *</label>
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => updateField('port', parseInt(e.target.value) || 0)}
                  error={!!errors.port}
                  className="mt-1.5 font-mono"
                />
                {errors.port && <p className="text-xs text-destructive mt-1">{errors.port}</p>}
              </div>
            </div>

            {/* ── Protocol-specific configuration ──────────────────── */}
            <Separator />
            <ProtocolConfigComponent
              config={(form.protocolConfig ?? {}) as Record<string, unknown>}
              onChange={(config) => updateField('protocolConfig', config)}
              disabled={isSubmitting}
            />
            <Separator />

            {/* ── Polling & UNS ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Poll Interval (ms)</label>
                <Input
                  type="number"
                  value={form.pollIntervalMs ?? 1000}
                  onChange={(e) => updateField('pollIntervalMs', parseInt(e.target.value) || 1000)}
                  min={50}
                  max={3600000}
                  className="mt-1.5 font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">50ms - 1hr</p>
              </div>
              <div>
                <label className="text-sm font-medium">UNS Prefix</label>
                <Input
                  value={form.unsPrefix ?? ''}
                  onChange={(e) => updateField('unsPrefix', e.target.value)}
                  placeholder="enterprise/site/area/line"
                  className="mt-1.5 font-mono"
                />
              </div>
            </div>

            {/* ── Optional fields ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input
                  value={form.location ?? ''}
                  onChange={(e) => updateField('location', e.target.value)}
                  placeholder="Building A - Line 1"
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={form.description ?? ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Optional description"
                  className="mt-1.5"
                />
              </div>
            </div>

            {/* Enabled */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="device-enabled"
                checked={form.enabled ?? true}
                onChange={(e) => updateField('enabled', e.target.checked)}
                className={cn('h-4 w-4 rounded border-input accent-primary')}
              />
              <label htmlFor="device-enabled" className="text-sm font-medium">
                Enabled
              </label>
            </div>

            {/* ── Actions ────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isEditing ? 'Save Changes' : 'Add Device'}
              </Button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
