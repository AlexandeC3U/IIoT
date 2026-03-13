import { Input } from '@/components/ui/input';
import type { EthernetipDeviceConfig } from '@/lib/api';

interface EthernetipConfigProps {
  config: Partial<EthernetipDeviceConfig>;
  onChange: (config: Partial<EthernetipDeviceConfig>) => void;
  disabled?: boolean;
}

export function EthernetipConfig({ config, onChange, disabled }: EthernetipConfigProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        EtherNet/IP Settings
      </h4>

      <div>
        <label className="text-sm font-medium">Slot</label>
        <Input
          type="number"
          value={config.slot ?? ''}
          onChange={(e) =>
            onChange({ ...config, slot: e.target.value ? parseInt(e.target.value) : undefined })
          }
          min={0}
          max={16}
          placeholder="0"
          disabled={disabled}
          className="mt-1.5 font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Processor slot in the backplane (usually 0)
        </p>
      </div>

      <div className="rounded-md border border-border/50 bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          EtherNet/IP support is in preview. Additional configuration options will be available in a
          future release.
        </p>
      </div>
    </div>
  );
}

export function getEthernetipDefaults(): Partial<EthernetipDeviceConfig> {
  return {};
}
