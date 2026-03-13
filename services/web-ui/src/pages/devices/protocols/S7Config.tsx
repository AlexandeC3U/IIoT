import { Input } from '@/components/ui/input';
import type { S7DeviceConfig } from '@/lib/api';

interface S7ConfigProps {
  config: Partial<S7DeviceConfig>;
  onChange: (config: Partial<S7DeviceConfig>) => void;
  disabled?: boolean;
}

export function S7Config({ config, onChange, disabled }: S7ConfigProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Siemens S7 Settings
      </h4>

      <div className="grid grid-cols-2 gap-3">
        {/* Rack */}
        <div>
          <label className="text-sm font-medium">Rack *</label>
          <Input
            type="number"
            value={config.rack ?? 0}
            onChange={(e) => onChange({ ...config, rack: parseInt(e.target.value) || 0 })}
            min={0}
            max={7}
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">PLC rack (0-7, usually 0)</p>
        </div>

        {/* Slot */}
        <div>
          <label className="text-sm font-medium">Slot *</label>
          <Input
            type="number"
            value={config.slot ?? 1}
            onChange={(e) => onChange({ ...config, slot: parseInt(e.target.value) || 0 })}
            min={0}
            max={31}
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            CPU slot (S7-300/400: 2, S7-1200/1500: 0 or 1)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* PDU Size */}
        <div>
          <label className="text-sm font-medium">PDU Size</label>
          <Input
            type="number"
            value={config.pduSize ?? ''}
            onChange={(e) =>
              onChange({ ...config, pduSize: e.target.value ? parseInt(e.target.value) : undefined })
            }
            min={240}
            max={960}
            placeholder="480"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">Protocol Data Unit size</p>
        </div>

        {/* Timeout */}
        <div>
          <label className="text-sm font-medium">Timeout (ms)</label>
          <Input
            type="number"
            value={config.timeout ?? ''}
            onChange={(e) =>
              onChange({ ...config, timeout: e.target.value ? parseInt(e.target.value) : undefined })
            }
            min={100}
            max={30000}
            placeholder="5000"
            disabled={disabled}
            className="mt-1.5 font-mono"
          />
        </div>
      </div>
    </div>
  );
}

export function getS7Defaults(): Partial<S7DeviceConfig> {
  return { rack: 0, slot: 1 };
}
