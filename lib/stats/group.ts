import { createAdminClient } from "@/lib/supabase/admin";
import type { StudentRow } from "@/lib/stats/teacher";

const LOW_SCORE_THRESHOLD = 50;
const INACTIVE_DAYS_THRESHOLD = 14;
const TOP_COUNT = 3;


export interface GroupOverviewKPIs {
  total_members: number;
  active_last_7d: number;
  mocks_completed_last_7d: number;
  group_average_pct: number | null;
  members_with_data: number;
  attention_count: number;
}


export interface GroupComparison {
  group_avg_pct: number | null;
  academy_avg_pct: number | null;
  diff_pct: number | null; // positivo = grupo por encima academia
  members_in_academy_same_level: number;
}


export interface GroupStats {
  kpis: GroupOverviewKPIs;
  members: StudentRow[];
  attention_low_score: StudentRow[];
  attention_inactive: StudentRow[];
  top_students: StudentRow[];
  comparison: GroupComparison;
}


/**
 * Carga las stats agregadas de un grupo.
 *
 * Toma como base la misma lógica de loadTeacherStats pero acotada a
 * los student_id que pertenecen al grupo. Además calcula:
 *   · Media del grupo
 *   · Comparativa vs academia (mismo nivel que el grupo)
 */
export async function loadGroupStats(params: {
  groupId: string;
  academyId: string;
  groupLevel: string | null;
}): Promise<GroupStats> {
  const admin = createAdminClient();
  const { groupId, academyId, groupLevel } = params;

  // ─── 1. Miembros del grupo ────────────────────────────────────
  const { data: memberRows } = await admin
    .from("student_group_members")
    .select("student_id")
    .eq("group_id", groupId);

  const memberIds = (memberRows ?? []).map((r) => r.student_id);

  if (memberIds.length === 0) {
    return {
      kpis: {
        total_members: 0,
        active_last_7d: 0,
        mocks_completed_last_7d: 0,
        group_average_pct: null,
        members_with_data: 0,
        attention_count: 0,
      },
      members: [],
      attention_low_score: [],
      attention_inactive: [],
      top_students: [],
      comparison: {
        group_avg_pct: null,
        academy_avg_pct: null,
        diff_pct: null,
        members_in_academy_same_level: 0,
      },
    };
  }

  // ─── 2. Perfiles ─────────────────────────────────────────────
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, current_level")
    .in("id", memberIds);

  const profileById = new Map<
    string,
    { name: string; email: string; level: string | null }
  >();
  (profiles ?? []).forEach((p) =>
    profileById.set(p.id, {
      name: p.full_name ?? "—",
      email: p.email ?? "",
      level: p.current_level ?? null,
    })
  );

  // ─── 3. Attempts + paper_attempts (para calcular scores) ─────
  const { data: attempts } = await admin
    .from("attempts")
    .select("id, student_id, exam_id, submitted_at, updated_at, started_at")
    .in("student_id", memberIds);

  const attemptsList = attempts ?? [];
  const attemptIds = attemptsList.map((a) => a.id);
  const examIds = Array.from(new Set(attemptsList.map((a) => a.exam_id)));

  const { data: paperAttempts } = attemptIds.length
    ? await admin
        .from("paper_attempts")
        .select(
          "attempt_id, paper_id, status, raw_score, max_score, completed_at, last_active_at"
        )
        .in("attempt_id", attemptIds)
    : { data: [] };

  const { data: publishedPapers } = examIds.length
    ? await admin
        .from("exam_papers")
        .select("id, exam_id, is_available")
        .in("exam_id", examIds)
    : { data: [] };

  const publishedByExam = new Map<string, string[]>();
  (publishedPapers ?? []).forEach((p) => {
    if (!p.is_available) return;
    const arr = publishedByExam.get(p.exam_id) ?? [];
    arr.push(p.id);
    publishedByExam.set(p.exam_id, arr);
  });

  const completedByAttempt = new Map<string, Set<string>>();
  const scoresByAttempt = new Map<string, { raw: number; max: number }>();
  const lastActivityByAttempt = new Map<string, string>();

  (paperAttempts ?? []).forEach((pa) => {
    if (pa.status === "completed" || pa.status === "time_expired") {
      const set = completedByAttempt.get(pa.attempt_id) ?? new Set<string>();
      set.add(pa.paper_id);
      completedByAttempt.set(pa.attempt_id, set);

      if (pa.raw_score !== null && pa.max_score !== null) {
        const rec = scoresByAttempt.get(pa.attempt_id) ?? { raw: 0, max: 0 };
        rec.raw += Number(pa.raw_score);
        rec.max += Number(pa.max_score);
        scoresByAttempt.set(pa.attempt_id, rec);
      }
    }

    const lastAct = pa.last_active_at ?? pa.completed_at;
    if (lastAct) {
      const prev = lastActivityByAttempt.get(pa.attempt_id);
      if (!prev || new Date(lastAct) > new Date(prev)) {
        lastActivityByAttempt.set(pa.attempt_id, lastAct);
      }
    }
  });

  // ─── 4. Agregar por miembro ──────────────────────────────────
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  let mocksCompletedLast7d = 0;
  const activeMembersLast7d = new Set<string>();

  const perStudent = new Map<
    string,
    {
      completed_count: number;
      score_pcts: number[];
      last_activity: string | null;
    }
  >();

  memberIds.forEach((sid) =>
    perStudent.set(sid, {
      completed_count: 0,
      score_pcts: [],
      last_activity: null,
    })
  );

  attemptsList.forEach((a) => {
    const totalPapers = publishedByExam.get(a.exam_id)?.length ?? 0;
    const donePapers = completedByAttempt.get(a.id)?.size ?? 0;
    const isCompleted = totalPapers > 0 && donePapers >= totalPapers;

    const rec = perStudent.get(a.student_id);
    if (!rec) return;

    if (isCompleted) {
      rec.completed_count += 1;
      const scores = scoresByAttempt.get(a.id);
      if (scores && scores.max > 0) {
        rec.score_pcts.push((scores.raw / scores.max) * 100);
      }
      if (a.submitted_at) {
        const t = new Date(a.submitted_at).getTime();
        if (t >= sevenDaysAgo) mocksCompletedLast7d += 1;
      }
    }

    const paperLastAct = lastActivityByAttempt.get(a.id);
    const candidates = [
      a.submitted_at,
      a.updated_at,
      a.started_at,
      paperLastAct,
    ].filter((x): x is string => Boolean(x));

    candidates.forEach((iso) => {
      if (!rec.last_activity || new Date(iso) > new Date(rec.last_activity)) {
        rec.last_activity = iso;
      }
    });

    if (rec.last_activity) {
      const t = new Date(rec.last_activity).getTime();
      if (t >= sevenDaysAgo) activeMembersLast7d.add(a.student_id);
    }
  });

  // ─── 5. Construir StudentRow[] para miembros ─────────────────
  const members: StudentRow[] = memberIds.map((sid) => {
    const p = profileById.get(sid);
    const rec = perStudent.get(sid)!;

    const avgPct =
      rec.score_pcts.length > 0
        ? Math.round(
            rec.score_pcts.reduce((s, x) => s + x, 0) / rec.score_pcts.length
          )
        : null;

    const daysInactive = rec.last_activity
      ? Math.floor(
          (now - new Date(rec.last_activity).getTime()) / (24 * 60 * 60 * 1000)
        )
      : null;

    let flag: "low_score" | "inactive" | null = null;
    if (avgPct !== null && avgPct < LOW_SCORE_THRESHOLD) {
      flag = "low_score";
    } else if (
      daysInactive !== null &&
      daysInactive > INACTIVE_DAYS_THRESHOLD
    ) {
      flag = "inactive";
    }

    return {
      student_id: sid,
      full_name: p?.name ?? "—",
      email: p?.email ?? "",
      level: p?.level ?? null,
      mocks_completed: rec.completed_count,
      average_score_pct: avgPct,
      last_activity_at: rec.last_activity,
      days_inactive: daysInactive,
      attention_flag: flag,
    };
  });

  // ─── 6. Secciones derivadas ──────────────────────────────────
  const attention_low_score = members
    .filter((s) => s.attention_flag === "low_score")
    .sort(
      (a, b) => (a.average_score_pct ?? 0) - (b.average_score_pct ?? 0)
    );

  const attention_inactive = members
    .filter((s) => s.attention_flag === "inactive")
    .sort((a, b) => (b.days_inactive ?? 0) - (a.days_inactive ?? 0));

  const top_students = [...members]
    .filter((s) => s.average_score_pct !== null && s.mocks_completed >= 1)
    .sort((a, b) => (b.average_score_pct ?? 0) - (a.average_score_pct ?? 0))
    .slice(0, TOP_COUNT);

  // ─── 7. KPIs ─────────────────────────────────────────────────
  const allAvgs = members
    .map((s) => s.average_score_pct)
    .filter((x): x is number => x !== null);

  const groupAvgPct =
    allAvgs.length > 0
      ? Math.round(allAvgs.reduce((s, x) => s + x, 0) / allAvgs.length)
      : null;

  const kpis: GroupOverviewKPIs = {
    total_members: memberIds.length,
    active_last_7d: activeMembersLast7d.size,
    mocks_completed_last_7d: mocksCompletedLast7d,
    group_average_pct: groupAvgPct,
    members_with_data: allAvgs.length,
    attention_count: attention_low_score.length + attention_inactive.length,
  };

  // ─── 8. Comparativa vs academia (mismo nivel) ────────────────
  const comparison = await computeGroupComparison({
    academyId,
    groupLevel,
    groupAvgPct: groupAvgPct !== null ? groupAvgPct / 1 : null,
  });

  return {
    kpis,
    members,
    attention_low_score,
    attention_inactive,
    top_students,
    comparison,
  };
}


/**
 * Compara la media del grupo con la media de todos los alumnos del
 * MISMO NIVEL en la academia.
 */
async function computeGroupComparison(params: {
  academyId: string;
  groupLevel: string | null;
  groupAvgPct: number | null;
}): Promise<GroupComparison> {
  const admin = createAdminClient();
  const { academyId, groupLevel, groupAvgPct } = params;

  // Alumnos del mismo nivel en la academia (o todos si el grupo no tiene nivel)
  let query = admin
    .from("profiles")
    .select("id")
    .eq("academy_id", academyId)
    .eq("role", "student");

  if (groupLevel) {
    query = query.eq("current_level", groupLevel);
  }

  const { data: peers } = await query;
  const peerIds = (peers ?? []).map((p) => p.id);

  if (peerIds.length === 0) {
    return {
      group_avg_pct: groupAvgPct !== null ? Math.round(groupAvgPct) : null,
      academy_avg_pct: null,
      diff_pct: null,
      members_in_academy_same_level: 0,
    };
  }

  // Cargar attempts + paper_attempts + papers para calcular media academia
  const { data: attempts } = await admin
    .from("attempts")
    .select("id, student_id, exam_id")
    .in("student_id", peerIds);

  const attemptsList = attempts ?? [];
  const attemptIds = attemptsList.map((a) => a.id);
  const examIds = Array.from(new Set(attemptsList.map((a) => a.exam_id)));

  if (attemptIds.length === 0) {
    return {
      group_avg_pct: groupAvgPct !== null ? Math.round(groupAvgPct) : null,
      academy_avg_pct: null,
      diff_pct: null,
      members_in_academy_same_level: peerIds.length,
    };
  }

  const { data: paperAttempts } = await admin
    .from("paper_attempts")
    .select("attempt_id, paper_id, status, raw_score, max_score")
    .in("attempt_id", attemptIds);

  const { data: publishedPapers } = examIds.length
    ? await admin
        .from("exam_papers")
        .select("id, exam_id, is_available")
        .in("exam_id", examIds)
    : { data: [] };

  const publishedByExam = new Map<string, string[]>();
  (publishedPapers ?? []).forEach((p) => {
    if (!p.is_available) return;
    const arr = publishedByExam.get(p.exam_id) ?? [];
    arr.push(p.id);
    publishedByExam.set(p.exam_id, arr);
  });

  const completedByAttempt = new Map<string, Set<string>>();
  const scoresByAttempt = new Map<string, { raw: number; max: number }>();

  (paperAttempts ?? []).forEach((pa) => {
    if (pa.status === "completed" || pa.status === "time_expired") {
      const set = completedByAttempt.get(pa.attempt_id) ?? new Set<string>();
      set.add(pa.paper_id);
      completedByAttempt.set(pa.attempt_id, set);

      if (pa.raw_score !== null && pa.max_score !== null) {
        const rec = scoresByAttempt.get(pa.attempt_id) ?? { raw: 0, max: 0 };
        rec.raw += Number(pa.raw_score);
        rec.max += Number(pa.max_score);
        scoresByAttempt.set(pa.attempt_id, rec);
      }
    }
  });

  const scoresByStudent = new Map<string, number[]>();
  attemptsList.forEach((a) => {
    const totalPapers = publishedByExam.get(a.exam_id)?.length ?? 0;
    const donePapers = completedByAttempt.get(a.id)?.size ?? 0;
    if (totalPapers === 0 || donePapers < totalPapers) return;
    const s = scoresByAttempt.get(a.id);
    if (!s || s.max === 0) return;
    const pct = (s.raw / s.max) * 100;
    const arr = scoresByStudent.get(a.student_id) ?? [];
    arr.push(pct);
    scoresByStudent.set(a.student_id, arr);
  });

  const avgByStudent: number[] = [];
  scoresByStudent.forEach((pcts) => {
    if (pcts.length > 0) {
      avgByStudent.push(pcts.reduce((s, x) => s + x, 0) / pcts.length);
    }
  });

  const academyAvg =
    avgByStudent.length > 0
      ? avgByStudent.reduce((s, x) => s + x, 0) / avgByStudent.length
      : null;

  return {
    group_avg_pct: groupAvgPct !== null ? Math.round(groupAvgPct) : null,
    academy_avg_pct: academyAvg !== null ? Math.round(academyAvg) : null,
    diff_pct:
      groupAvgPct !== null && academyAvg !== null
        ? Math.round(groupAvgPct - academyAvg)
        : null,
    members_in_academy_same_level: peerIds.length,
  };
}
