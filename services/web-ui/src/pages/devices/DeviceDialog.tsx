import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { deviceApi, type CreateDeviceInput, type Device } from '@/lib/api';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';

interface DeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: Device | null;
  onSuccess: () => void;
}

type FormData = CreateDeviceInput;

export function DeviceDialog({ open, onOpenChange, device, onSuccess }: DeviceDialogProps) {
  const isEditing = !!device;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: device
      ? {
          name: device.name,
          description: device.description ?? '',
          protocol: device.protocol,
          host: device.host,
          port: device.port,
          pollIntervalMs: device.pollIntervalMs,
          location: device.location ?? '',
          enabled: device.enabled,
        }
      : {
          name: '',
          description: '',
          protocol: 'modbus',
          host: '',
          port: 502,
          pollIntervalMs: 1000,
          location: '',
          enabled: true,
        },
  });

  const protocol = watch('protocol');

  const createMutation = useMutation({
    mutationFn: (data: CreateDeviceInput) => deviceApi.create(data),
    onSuccess: () => {
      toast({ title: 'Device created', description: 'Device added successfully' });
      reset();
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

  const onSubmit = handleSubmit((data) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  });

  // Reset form when device changes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-lg translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Title className="text-lg font-semibold">
            {isEditing ? 'Edit Device' : 'Add Device'}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing
              ? 'Update the device configuration below.'
              : 'Configure a new device to connect to your industrial network.'}
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium">Name *</label>
              <input
                {...register('name', { required: 'Name is required' })}
                className={cn(
                  'w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring',
                  errors.name && 'border-destructive'
                )}
                placeholder="PLC-001"
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Protocol */}
            <div>
              <label className="text-sm font-medium">Protocol *</label>
              <select
                {...register('protocol', { required: true })}
                disabled={isEditing}
                className="w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                <option value="modbus">Modbus TCP/RTU</option>
                <option value="opcua">OPC UA</option>
                <option value="s7">Siemens S7</option>
              </select>
              {isEditing && (
                <p className="text-xs text-muted-foreground mt-1">Protocol cannot be changed</p>
              )}
            </div>

            {/* Host & Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-sm font-medium">Host *</label>
                <input
                  {...register('host', { required: 'Host is required' })}
                  className={cn(
                    'w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono',
                    errors.host && 'border-destructive'
                  )}
                  placeholder="192.168.1.10"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Port *</label>
                <input
                  type="number"
                  {...register('port', {
                    required: 'Port is required',
                    valueAsNumber: true,
                    min: { value: 1, message: 'Min 1' },
                    max: { value: 65535, message: 'Max 65535' },
                  })}
                  className={cn(
                    'w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono',
                    errors.port && 'border-destructive'
                  )}
                  placeholder={protocol === 'modbus' ? '502' : protocol === 'opcua' ? '4840' : '102'}
                />
              </div>
            </div>

            {/* Poll Interval */}
            <div>
              <label className="text-sm font-medium">Poll Interval (ms)</label>
              <input
                type="number"
                {...register('pollIntervalMs', {
                  valueAsNumber: true,
                  min: { value: 50, message: 'Min 50ms' },
                  max: { value: 3600000, message: 'Max 1 hour' },
                })}
                className="w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground mt-1">
                How often to poll this device for data (50ms - 1hr)
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                {...register('description')}
                rows={2}
                className="w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Optional description..."
              />
            </div>

            {/* Location */}
            <div>
              <label className="text-sm font-medium">Location</label>
              <input
                {...register('location')}
                className="w-full mt-1.5 px-3 py-2 text-sm bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Building A - Line 1"
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                {...register('enabled')}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="enabled" className="text-sm font-medium">
                Enabled
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Device'}
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

