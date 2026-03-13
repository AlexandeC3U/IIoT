import { Input } from '@/components/ui/input';
import type { BacnetDeviceConfig } from '@/lib/api';

interface BacnetConfigProps {
  config: Partial<BacnetDeviceConfig>;
  onChange: (config: Partial<BacnetDeviceConfig>) => void;
  disabled?: boolean;
}

export function BacnetConfig({ config, onChange, disabled }: BacnetConfigProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        BACnet/IP Settings
      </h4>

      <div>
        <label className="text-sm font-medium">Device Instance</label>
        <Input
          type="number"
          value={config.deviceInstance ?? ''}
          onChange={(e) =>
            onChange({
              ...config,
              deviceInstance: e.target.value ? parseInt(e.target.value) : undefined,
            })
          }
          min={0}
          max={4194303}
          placeholder="Auto-discover"
          disabled={disabled}
          className="mt-1.5 font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          BACnet device instance number (0-4194303). Leave empty for auto-discovery.
        </p>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          BACnet/IP support is in preview. Additional configuration options will be available in a
          future release.
        </p>
      </div>
    </div>
  );
}

export function getBacnetDefaults(): Partial<BacnetDeviceConfig> {
  return {};
}
