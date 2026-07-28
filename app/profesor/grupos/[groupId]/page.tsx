import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  Users,
  GraduationCap,
  Calendar,
  ClipboardList,
  User,
  BarChart3,
} from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGroupDetail } from "@/lib/groups/loader";
import { loadGroupStats } from "@/lib/stats/group";
import { GroupOverviewCards } from "@/components/profesor/stats/group-overview-cards";
import { GroupComparisonCard } from "@/components/profesor/stats/group-comparison-card";
import { AttentionSection } from "@/components/profesor/stats/attention-section";
import { TopSection } from "@/components/profesor/stats/top-section";

interface Props {
  params: { groupId: string };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default async function ProfesorGrupoDetallePage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { profile } = user;
  if (
    profile.role !== "teacher" &&
    profile.role !== "academy_admin" &&
    profile.role !== "super_admin"
  ) {
    redirect("/");
  }

  const group = await loadGroupDetail(params.groupId);
  if (!group) notFound();

  const admin = createAdminClient();

  // Verificar visibilidad
  const { data: groupCheck } = await admin
    .from("student_groups")
    .select("academy_id, teacher_id")
    .eq("id", params.groupId)
    .maybeSingle();

  const isAdmin =
    profile.role === "academy_admin" || profile.role === "super_admin";
  const isTeacherOfGroup = groupCheck?.teacher_id === user.id;
  const isSameAcademy = groupCheck?.academy_id === profile.academy_id;

  if (
    profile.role !== "super_admin" &&
    !isTeacherOfGroup &&
    !(isAdmin && isSameAcademy)
  ) {
    return (
      <div className="px-6 md:px-8 py-8">
        <p className="text-sm text-error">
          No tienes permiso para ver este grupo.
        </p>
        <Link
          href="/profesor/grupos"
          className="text-sm text-navy hover:underline mt-4 inline-block"
        >
          Volver a grupos
        </Link>
      </div>
    );
  }

  // Cargar stats agregadas del grupo
  const stats = await loadGroupStats({
    groupId: group.id,
    academyId: groupCheck?.academy_id ?? profile.academy_id!,
    groupLevel: group.level,
  });

  const hasStatsData = stats.kpis.members_with_data > 0;
  const assignHref = `/profesor/asignaciones/nueva?groupId=${group.id}`;

  return (
    <div className="px-6 md:px-8 py-8 max-w-5xl">
      <Link
        href="/profesor/grupos"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a grupos
      </Link>

      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <p className="text-xs uppercase tracking-wider text-muted">
              Grupo
            </p>
            {group.level && (
              <span className="text-[10px] uppercase tracking-wider text-navy font-semibold px-2 py-0.5 rounded bg-navy/5">
                {group.level}
              </span>
            )}
          </div>
          <h1 className="text-3xl font-semibold text-ink tracking-tight">
            {group.name}
          </h1>
          {group.description && (
            <p className="text-sm text-muted mt-2 max-w-xl">
              {group.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-4 text-sm text-muted flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Profesor:{" "}
              <strong className="text-ink font-medium">
                {group.teacher_name}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {group.member_count}{" "}
              {group.member_count === 1 ? "alumno" : "alumnos"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Creado el {formatDate(group.created_at)}
            </span>
          </div>
        </div>

        {group.member_count > 0 && (
          <Link
            href={assignHref}
            className="inline-flex items-center gap-2 rounded bg-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-navy/90 transition-colors flex-shrink-0"
          >
            <ClipboardList className="h-4 w-4" />
            Asignar mock al grupo
          </Link>
        )}
      </header>

      {group.member_count === 0 ? (
        <div className="rounded-lg border border-rule bg-white p-8 text-center">
          <p className="text-sm text-muted">
            Este grupo aún no tiene alumnos.
            {isAdmin && (
              <>
                {" "}
                <Link
                  href={`/academia/grupos/${group.id}`}
                  className="text-navy underline hover:text-ink"
                >
                  Añádelos desde el panel de admin
                </Link>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Stats agregadas del grupo (solo si algún alumno tiene mocks) */}
          {hasStatsData ? (
            <>
              <section className="mb-8">
                <h2 className="text-sm font-medium text-ink uppercase tracking-wider mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-saffron" />
                  Panorama del grupo
                </h2>
                <GroupOverviewCards kpis={stats.kpis} />
              </section>

              <GroupComparisonCard
                comparison={stats.comparison}
                groupLevel={group.level}
              />

              <AttentionSection
                lowScore={stats.attention_low_score}
                inactive={stats.attention_inactive}
              />

              <TopSection students={stats.top_students} />
            </>
          ) : (
            <div className="rounded-lg border border-navy/20 bg-navy/5 p-5 mb-8">
              <p className="text-sm text-ink">
                <strong>Los alumnos del grupo aún no han completado ningún mock.</strong>
              </p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Cuando terminen su primer mock, empezarán a aparecer aquí las
                estadísticas del grupo: media, comparativa con la academia,
                atención y destacados.
              </p>
            </div>
          )}

          {/* Lista completa de miembros */}
          <section>
            <h2 className="text-sm font-medium text-ink uppercase tracking-wider mb-4">
              Miembros del grupo
            </h2>
            <div className="rounded-lg border border-rule bg-white overflow-hidden">
              <div className="divide-y divide-rule">
                {group.members.map((m) => (
                  <Link
                    key={m.student_id}
                    href={`/profesor/alumnos/${m.student_id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper transition-colors group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <User className="h-4 w-4 text-muted flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate group-hover:underline">
                          {m.full_name}
                        </p>
                        <p className="text-xs text-muted truncate">{m.email}</p>
                      </div>
                      {m.level && (
                        <span className="text-[10px] uppercase tracking-wider text-navy font-semibold px-2 py-0.5 rounded bg-navy/5 flex-shrink-0">
                          {m.level}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
