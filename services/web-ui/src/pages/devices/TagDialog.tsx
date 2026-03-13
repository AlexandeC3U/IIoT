import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/toaster';
import {
  BYTE_ORDERS,
  DATA_TYPES,
  MODBUS_REGISTER_TYPES,
  tagApi,
  type ByteOrder,
  type CreateTagInput,
  type ModbusRegisterType,
  type Protocol,
  type Tag,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  protocol: Protocol;
  tag: Tag | null;
  onSuccess: () => void;
}

interface TagFormData extends Omit<CreateTagInput, 'deviceId'> {
  // Protocol-specific extras stored in metadata
  registerType?: ModbusRegisterType;
  byteOrder?: ByteOrder;
  opcNodeId?: string;
  s7Address?: string;
}

function buildInitialForm(tag: Tag | null, protocol: Protocol): TagFormData {
  if (tag) {
    return {
      name: tag.name,
      description: tag.description ?? '',
      address: tag.address,
      dataType: tag.dataType,
      accessMode: tag.accessMode,
      enabled: tag.enabled,
      scaleFactor: tag.scaleFactor ?? undefined,
      scaleOffset: tag.scaleOffset ?? undefined,
      clampMin: tag.clampMin ?? undefined,
      clampMax: tag.clampMax ?? undefined,
      engineeringUnits: tag.engineeringUnits ?? undefined,
      deadbandType: tag.deadbandType,
      deadbandAbsolute: tag.deadbandAbsolute ?? undefined,
      deadbandPercent: tag.deadbandPercent ?? undefined,
      topicSuffix: tag.topicSuffix ?? undefined,
      priority: tag.priority,
      // Extract protocol-specific from metadata
      registerType: (tag.metadata?.registerType as ModbusRegisterType) ?? undefined,
      byteOrder: (tag.metadata?.byteOrder as ByteOrder) ?? undefined,
      opcNodeId: (tag.metadata?.opcNodeId as string) ?? undefined,
      s7Address: (tag.metadata?.s7Address as string) ?? undefined,
    };
  }
  return {
    name: '',
    description: '',
    address: '',
    dataType: 'float32',
    accessMode: 'read',
    enabled: true,
    priority: 0,
    deadbandType: 'none',
    // Protocol-specific defaults
    ...(protocol === 'modbus' && { registerType: 'holding' as ModbusRegisterType, byteOrder: 'big_endian' as ByteOrder }),
  };
}

export function TagDialog({ open, onOpenChange, deviceId, protocol, tag, onSuccess }: TagDialogProps) {
  const isEditing = !!tag;
  const [form, setForm] = useState<TagFormData>(() => buildInitialForm(tag, protocol));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(tag, protocol));
      setErrors({});
      setShowAdvanced(false);
    }
  }, [open, tag, protocol]);

  const updateField = useCallback(
    <K extends keyof TagFormData>(key: K, value: TagFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.address.trim()) errs.address = 'Address is required';
    if (!form.dataType) errs.dataType = 'Data type is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = (): CreateTagInput => {
    const { registerType, byteOrder, opcNodeId, s7Address, ...base } = form;
    // Store protocol-specific fields in metadata
    const metadata: Record<string, unknown> = {};
    if (registerType) metadata.registerType = registerType;
    if (byteOrder) metadata.byteOrder = byteOrder;
    if (opcNodeId) metadata.opcNodeId = opcNodeId;
    if (s7Address) metadata.s7Address = s7Address;

    return {
      ...base,
      deviceId,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  };

  const createMutation = useMutation({
    mutationFn: () => tagApi.create(buildPayload()),
    onSuccess: () => {
      toast({ title: 'Tag created', description: 'Tag added successfully' });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create tag',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => tagApi.update(tag!.id, buildPayload()),
    onSuccess: () => {
      toast({ title: 'Tag updated', description: 'Tag updated successfully' });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tag',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[90vw] max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <Dialog.Title className="text-lg font-semibold">
            {isEditing ? 'Edit Tag' : 'Add Tag'}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            {isEditing
              ? 'Update the tag configuration.'
              : `Add a new data tag for this ${protocol.toUpperCase()} device.`}
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            {/* ── Core fields ──────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Tag Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  error={!!errors.name}
                  placeholder="Temperature_Sensor_01"
                  className="mt-1.5"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Data Type *</label>
                <select
                  value={form.dataType}
                  onChange={(e) => updateField('dataType', e.target.value)}
                  className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {DATA_TYPES.map((dt) => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </select>
                {errors.dataType && <p className="text-xs text-destructive mt-1">{errors.dataType}</p>}
              </div>
            </div>

            {/* ── Protocol-specific address fields ─────────────── */}
            {protocol === 'modbus' && <ModbusTagFields form={form} updateField={updateField} errors={errors} />}
            {protocol === 'opcua' && <OpcuaTagFields form={form} updateField={updateField} errors={errors} />}
            {protocol === 's7' && <S7TagFields form={form} updateField={updateField} errors={errors} />}
            {protocol === 'mqtt' && <MqttTagFields form={form} updateField={updateField} errors={errors} />}
            {(protocol === 'bacnet' || protocol === 'ethernetip') && (
              <GenericTagFields form={form} updateField={updateField} errors={errors} protocol={protocol} />
            )}

            {/* ── Access mode + enabled ─────────────────────────── */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Access Mode</label>
                <select
                  value={form.accessMode ?? 'read'}
                  onChange={(e) => updateField('accessMode', e.target.value as 'read' | 'write' | 'readwrite')}
                  className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="read">Read</option>
                  <option value="write">Write</option>
                  <option value="readwrite">Read/Write</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Engineering Units</label>
                <Input
                  value={form.engineeringUnits ?? ''}
                  onChange={(e) => updateField('engineeringUnits', e.target.value || undefined)}
                  placeholder="°C, bar, kW..."
                  className="mt-1.5"
                />
              </div>
              <div className="flex items-end pb-0.5">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="tag-enabled"
                    checked={form.enabled ?? true}
                    onChange={(e) => updateField('enabled', e.target.checked)}
                    className={cn('h-4 w-4 rounded border-input accent-primary')}
                  />
                  <label htmlFor="tag-enabled" className="text-sm font-medium">
                    Enabled
                  </label>
                </div>
              </div>
            </div>

            {/* ── Advanced (collapsible) ──────────────────────── */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvanced ? '- Hide' : '+ Show'} advanced options
              </button>
            </div>

            {showAdvanced && (
              <>
                <Separator />
                <div className="space-y-4">
                  {/* Scaling */}
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Scaling & Clamping
                  </h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs font-medium">Scale Factor</label>
                      <Input
                        type="number"
                        step="any"
                        value={form.scaleFactor ?? ''}
                        onChange={(e) => updateField('scaleFactor', e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="1.0"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Scale Offset</label>
                      <Input
                        type="number"
                        step="any"
                        value={form.scaleOffset ?? ''}
                        onChange={(e) => updateField('scaleOffset', e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="0"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Clamp Min</label>
                      <Input
                        type="number"
                        step="any"
                        value={form.clampMin ?? ''}
                        onChange={(e) => updateField('clampMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="—"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">Clamp Max</label>
                      <Input
                        type="number"
                        step="any"
                        value={form.clampMax ?? ''}
                        onChange={(e) => updateField('clampMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="—"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Deadband */}
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Deadband
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium">Type</label>
                      <select
                        value={form.deadbandType ?? 'none'}
                        onChange={(e) => updateField('deadbandType', e.target.value as 'none' | 'absolute' | 'percent')}
                        className="w-full mt-1 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="none">None</option>
                        <option value="absolute">Absolute</option>
                        <option value="percent">Percent</option>
                      </select>
                    </div>
                    {form.deadbandType === 'absolute' && (
                      <div>
                        <label className="text-xs font-medium">Absolute Value</label>
                        <Input
                          type="number"
                          step="any"
                          value={form.deadbandAbsolute ?? ''}
                          onChange={(e) => updateField('deadbandAbsolute', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="0.5"
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                    )}
                    {form.deadbandType === 'percent' && (
                      <div>
                        <label className="text-xs font-medium">Percent (%)</label>
                        <Input
                          type="number"
                          step="any"
                          value={form.deadbandPercent ?? ''}
                          onChange={(e) => updateField('deadbandPercent', e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="1.0"
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Priority & Topic */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium">Priority</label>
                      <select
                        value={form.priority ?? 0}
                        onChange={(e) => updateField('priority', parseInt(e.target.value))}
                        className="w-full mt-1 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value={0}>0 - Telemetry</option>
                        <option value={1}>1 - Control</option>
                        <option value={2}>2 - Safety / Alarm</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Topic Suffix</label>
                      <Input
                        value={form.topicSuffix ?? ''}
                        onChange={(e) => updateField('topicSuffix', e.target.value || undefined)}
                        placeholder="Auto (tag name)"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs font-medium">Description</label>
                    <Input
                      value={form.description ?? ''}
                      onChange={(e) => updateField('description', e.target.value || undefined)}
                      placeholder="Optional description"
                      className="mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── Actions ──────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isEditing ? 'Save Changes' : 'Add Tag'}
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

// ============================================================================
// Protocol-Specific Tag Field Components
// ============================================================================

interface TagFieldProps {
  form: TagFormData;
  updateField: <K extends keyof TagFormData>(key: K, value: TagFormData[K]) => void;
  errors: Record<string, string>;
}

function ModbusTagFields({ form, updateField, errors }: TagFieldProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium">Register Type</label>
          <select
            value={form.registerType ?? 'holding'}
            onChange={(e) => updateField('registerType', e.target.value as ModbusRegisterType)}
            className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {MODBUS_REGISTER_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {rt.charAt(0).toUpperCase() + rt.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Register Address *</label>
          <Input
            type="number"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
            error={!!errors.address}
            placeholder="40001"
            min={0}
            className="mt-1.5 font-mono"
          />
          {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">Byte Order</label>
          <select
            value={form.byteOrder ?? 'big_endian'}
            onChange={(e) => updateField('byteOrder', e.target.value as ByteOrder)}
            className="w-full mt-1.5 h-9 px-3 text-sm bg-transparent border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {BYTE_ORDERS.map((bo) => (
              <option key={bo} value={bo}>
                {bo === 'big_endian' ? 'Big Endian (AB CD)' : 'Little Endian (CD AB)'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function OpcuaTagFields({ form, updateField, errors }: TagFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Node ID *</label>
        <Input
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          error={!!errors.address}
          placeholder="ns=2;s=Channel1.Device1.Temperature"
          className="mt-1.5 font-mono"
        />
        {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          OPC UA node identifier. Supports ns=N;s=... or nsu=URI;s=... format.
        </p>
      </div>
    </div>
  );
}

function S7TagFields({ form, updateField, errors }: TagFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">S7 Address *</label>
        <Input
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          error={!!errors.address}
          placeholder="DB1.DBD0"
          className="mt-1.5 font-mono"
        />
        {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          Symbolic address: DB1.DBD0, MW100, I0.0, Q0.0, etc.
        </p>
      </div>
    </div>
  );
}

function MqttTagFields({ form, updateField, errors }: TagFieldProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Topic Path *</label>
        <Input
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          error={!!errors.address}
          placeholder="plant/area1/sensor/temperature"
          className="mt-1.5 font-mono"
        />
        {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          MQTT topic path for this data point
        </p>
      </div>
    </div>
  );
}

function GenericTagFields({ form, updateField, errors, protocol }: TagFieldProps & { protocol: Protocol }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Address *</label>
        <Input
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          error={!!errors.address}
          placeholder={`${protocol} address`}
          className="mt-1.5 font-mono"
        />
        {errors.address && <p className="text-xs text-destructive mt-1">{errors.address}</p>}
      </div>
    </div>
  );
}
