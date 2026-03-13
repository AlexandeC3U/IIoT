import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
        outline: 'text-foreground',
        // Protocol badges
        modbus: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        opcua: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        s7: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
        mqtt: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        bacnet: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
        ethernetip: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
        // Status badges
        online: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        offline: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
        error: 'border-red-500/30 bg-red-500/10 text-red-400',
        unknown: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
