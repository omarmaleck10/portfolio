import { Users, Activity, TrendingUp, AlertCircle } from "lucide-react";
import type { GroupOverviewKPIs } from "@/lib/stats/group";

interface Props {
  kpis: GroupOverviewKPIs;
}

function scoreColor(pct: number | null): string {
  if (pct === null) return "text-muted";
  if (pct >= 60) return "text-ok";
  if (pct >= 40) return "text-saffron";
  return "text-error";
}

export function GroupOverviewCards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {/* Miembros */}
      <div className="rounded-lg border border-rule bg-white p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-medium mb-3">
          <Users className="h-3.5 w-3.5 text-navy" />
          Miembros
        </div>
        <p className="text-3xl font-bold text-ink tabular-nums">
          {kpis.total_members}
        </p>
        <p className="text-xs text-muted mt-1">
          {kpis.active_last_7d} activos esta semana
        </p>
      </div>

      {/* Mocks 7d */}
      <div className="rounded-lg border border-rule bg-white p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-medium mb-3">
          <Activity className="h-3.5 w-3.5 text-navy" />
          Mocks 7 días
        </div>
        <p className="text-3xl font-bold text-ink tabular-nums">
          {kpis.mocks_completed_last_7d}
        </p>
        <p className="text-xs text-muted mt-1">completados esta semana</p>
      </div>

      {/* Media grupo */}
      <div className="rounded-lg border border-rule bg-white p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted font-medium mb-3">
          <TrendingUp className="h-3.5 w-3.5 text-navy" />
          Media grupo
        </div>
        {kpis.group_average_pct !== null ? (
          <>
            <p
              className={`text-3xl font-bold tabular-nums ${scoreColor(
                kpis.group_average_pct
              )}`}
            >
              {kpis.group_average_pct}
              <span className="text-lg text-muted font-normal">%</span>
            </p>
            <p className="text-xs text-muted mt-1">
              De {kpis.members_with_data}{" "}
              {kpis.members_with_data === 1 ? "alumno" : "alumnos"} con datos
            </p>
          </>
        ) : (
          <>
            <p className="text-3xl font-bold text-muted">—</p>
            <p className="text-xs text-muted mt-1">Sin datos aún</p>
          </>
        )}
      </div>

      {/* Alertas */}
      <div
        className={`rounded-lg border p-5 ${
          kpis.attention_count > 0
            ? "border-error/40 bg-error/5"
            : "border-rule bg-white"
        }`}
      >
        <div
          className={`flex items-center gap-2 text-xs uppercase tracking-wider font-medium mb-3 ${
            kpis.attention_count > 0 ? "text-error" : "text-muted"
          }`}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Alertas
        </div>
        <p
          className={`text-3xl font-bold tabular-nums ${
            kpis.attention_count > 0 ? "text-error" : "text-ink"
          }`}
        >
          {kpis.attention_count}
        </p>
        <p className="text-xs text-muted mt-1">
          {kpis.attention_count === 0 ? "Todo en orden" : "Ver detalle abajo"}
        </p>
      </div>
    </div>
  );
}
