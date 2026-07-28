import { TrendingUp, TrendingDown, Minus, Users2 } from "lucide-react";
import type { GroupComparison } from "@/lib/stats/group";

interface Props {
  comparison: GroupComparison;
  groupLevel: string | null;
}

export function GroupComparisonCard({ comparison, groupLevel }: Props) {
  const { group_avg_pct, academy_avg_pct, diff_pct, members_in_academy_same_level } =
    comparison;

  // Sin datos suficientes → no mostramos
  if (group_avg_pct === null || academy_avg_pct === null) return null;

  const above = diff_pct !== null && diff_pct > 2;
  const below = diff_pct !== null && diff_pct < -2;
  const near = diff_pct !== null && Math.abs(diff_pct) <= 2;

  const arrowIcon = above ? (
    <TrendingUp className="h-4 w-4" />
  ) : below ? (
    <TrendingDown className="h-4 w-4" />
  ) : (
    <Minus className="h-4 w-4" />
  );

  const arrowColor = above ? "text-ok" : below ? "text-error" : "text-navy";

  const label = above
    ? "El grupo va por encima"
    : below
    ? "El grupo va por debajo"
    : "En la media";

  const scope = groupLevel
    ? `del nivel ${groupLevel} en la academia`
    : `de la academia`;

  return (
    <div className="rounded-lg border border-navy/30 bg-navy/5 p-5 mb-8">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-navy font-medium mb-3">
        <Users2 className="h-3.5 w-3.5" />
        Comparativa {scope}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Grupo */}
        <div>
          <p className="text-xs text-muted mb-1">Este grupo</p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {group_avg_pct}%
          </p>
        </div>

        {/* Academia mismo nivel */}
        <div>
          <p className="text-xs text-muted mb-1">
            Media academia ({members_in_academy_same_level})
          </p>
          <p className="text-2xl font-bold text-ink tabular-nums">
            {academy_avg_pct}%
          </p>
        </div>

        {/* Diferencia */}
        <div>
          <p className="text-xs text-muted mb-1">Diferencia</p>
          <div className={`flex items-center gap-1.5 ${arrowColor}`}>
            {arrowIcon}
            <p className="text-2xl font-bold tabular-nums">
              {diff_pct !== null && diff_pct > 0 ? "+" : ""}
              {diff_pct ?? 0}%
            </p>
          </div>
        </div>
      </div>

      <p className={`text-xs mt-4 ${arrowColor}`}>
        <strong>{label}</strong>
        {near && (
          <span className="text-muted font-normal">
            {" · "}La diferencia es pequeña
          </span>
        )}
      </p>
    </div>
  );
}
