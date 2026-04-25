import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: number; // positive = up, negative = down
  icon?: React.ReactNode;
  accent?: string;
  className?: string;
}

export default function KpiCard({ label, value, subValue, trend, icon, accent, className = "" }: KpiCardProps) {
  const trendColor = trend === undefined ? '' : trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-muted-foreground';
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  return (
    <div className={`rounded-xl p-4 border border-border bg-card transition-all hover:border-primary/30 hover:shadow-lg ${className}`}
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: accent ? `${accent}20` : 'rgba(196,165,90,0.1)' }}>
            <span style={{ color: accent || 'hsl(43,85%,55%)' }} className="[&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
          </div>
        )}
      </div>
      <div className="num-display text-xl font-bold text-foreground mb-1">{value}</div>
      {(subValue || trend !== undefined) && (
        <div className="flex items-center gap-1.5">
          {trend !== undefined && TrendIcon && (
            <span className={trendColor}><TrendIcon className="w-3 h-3" /></span>
          )}
          {subValue && <p className={`text-xs ${trendColor || 'text-muted-foreground'}`}>{subValue}</p>}
        </div>
      )}
    </div>
  );
}
