import { AttendanceStatus, AuditAction, NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/utils/errors';
import { buildPaginationMeta } from '@/utils/pagination';
import type { PaginationMeta } from '@/utils/http';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import { getQueue } from '@/adapters/queue';
import { teacherClassIds } from '@/modules/shared/scope';
import type { AuthContext } from '@/types/express';
import type {
  AttendanceReportQuery,
  BulkMarkInput,
  CorrectAttendanceInput,
  ListAttendanceQuery,
} from './attendance.schemas';

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Verify the actor may record attendance for the given class. */
async function assertCanManageClass(auth: AuthContext, classId: string): Promise<void> {
  if (auth.role === 'SUPER_ADMIN') return;
  const klass = await prisma.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, tenantId: true },
  });
  if (!klass) throw new NotFoundError('Class');
  if (auth.role === 'ADMIN') {
    if (klass.tenantId !== auth.tenantId) throw new ForbiddenError('Class is outside your tenant');
    return;
  }
  if (auth.role === 'TEACHER') {
    const classIds = await teacherClassIds(auth.userId);
    if (!classIds.includes(classId)) throw new ForbiddenError('You do not teach this class');
    return;
  }
  throw new ForbiddenError();
}

export interface BulkMarkResult {
  date: string;
  classId: string;
  upserted: number;
  alertsQueued: number;
}

/**
 * Bulk mark/overwrite attendance for a class on a date. Idempotent via the
 * (studentId, date) unique constraint. Absent/late students trigger queued
 * notifications to their parents (respecting preferences).
 */
export async function bulkMark(
  auth: AuthContext,
  input: BulkMarkInput,
  ctx: AuditContext,
): Promise<BulkMarkResult> {
  await assertCanManageClass(auth, input.classId);
  const date = dateOnly(input.date);

  // All students must be enrolled in this class.
  const enrolled = await prisma.enrollment.findMany({
    where: { classId: input.classId, studentId: { in: input.records.map((r) => r.studentId) } },
    select: { studentId: true },
  });
  const enrolledSet = new Set(enrolled.map((e) => e.studentId));
  const invalid = input.records.filter((r) => !enrolledSet.has(r.studentId));
  if (invalid.length > 0) {
    throw new BadRequestError('Some students are not enrolled in this class', [
      { field: 'records', message: `${invalid.length} student(s) not in class` },
    ]);
  }

  const alertStudentIds: { studentId: string; status: AttendanceStatus }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const r of input.records) {
      const before = await tx.attendance.findUnique({
        where: { studentId_date: { studentId: r.studentId, date } },
      });
      const row = await tx.attendance.upsert({
        where: { studentId_date: { studentId: r.studentId, date } },
        create: {
          tenantId: auth.tenantId!,
          studentId: r.studentId,
          classId: input.classId,
          date,
          status: r.status,
          recordedBy: auth.userId,
          note: r.note ?? null,
        },
        update: { status: r.status, classId: input.classId, recordedBy: auth.userId, note: r.note ?? null },
      });
      await writeAudit(
        {
          ...ctx,
          action: before ? AuditAction.UPDATE : AuditAction.CREATE,
          tableName: 'attendance',
          recordId: row.id,
          before,
          after: row,
        },
        tx,
      );
      if (r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.LATE) {
        alertStudentIds.push({ studentId: r.studentId, status: r.status });
      }
    }
  });

  const alertsQueued = await queueAttendanceAlerts(alertStudentIds, input.date, auth.tenantId!);

  return {
    date: input.date,
    classId: input.classId,
    upserted: input.records.length,
    alertsQueued,
  };
}

/** Queue attendance alerts to each affected student's parents (per preferences). */
async function queueAttendanceAlerts(
  items: { studentId: string; status: AttendanceStatus }[],
  dateStr: string,
  tenantId: string,
): Promise<number> {
  if (items.length === 0) return 0;
  const queue = getQueue();
  let count = 0;

  for (const item of items) {
    const student = await prisma.student.findFirst({
      where: { id: item.studentId, deletedAt: null },
      select: {
        firstName: true,
        lastName: true,
        parents: {
          select: {
            phone: true,
            user: { select: { id: true, email: true } },
          },
        },
      },
    });
    if (!student) continue;

    for (const parent of student.parents) {
      const channels = await resolveChannels(
        parent.user.id,
        NotificationType.ATTENDANCE_ALERT,
        parent.phone,
        parent.user.email,
      );
      if (channels.length === 0) continue;
      await queue.enqueueNotification({
        tenantId,
        userId: parent.user.id,
        type: NotificationType.ATTENDANCE_ALERT,
        title: 'Attendance alert',
        body: `${student.firstName} ${student.lastName} was marked ${item.status} on ${dateStr}.`,
        channels,
        email: parent.user.email,
        phone: parent.phone,
      });
      count += 1;
    }
  }
  return count;
}

/**
 * Resolve which channels are enabled for a user/type. Defaults to IN_APP + EMAIL
 * (+ SMS when a phone exists) unless the user has explicit preference rows.
 */
async function resolveChannels(
  userId: string,
  type: NotificationType,
  phone: string | null,
  email: string | null,
): Promise<NotificationChannel[]> {
  const prefs = await prisma.notificationPreference.findMany({ where: { userId, type } });
  if (prefs.length > 0) {
    return prefs
      .filter((p) => p.enabled)
      .map((p) => p.channel)
      .filter((c) => {
        if (c === NotificationChannel.SMS) return Boolean(phone);
        if (c === NotificationChannel.EMAIL) return Boolean(email);
        return true;
      });
  }
  const defaults: NotificationChannel[] = [NotificationChannel.IN_APP];
  if (email) defaults.push(NotificationChannel.EMAIL);
  if (phone) defaults.push(NotificationChannel.SMS);
  return defaults;
}

export async function listAttendance(
  auth: AuthContext,
  query: ListAttendanceQuery,
): Promise<{ items: unknown[]; meta: PaginationMeta }> {
  if (query.classId) await assertCanManageClassReadonly(auth, query.classId);

  const where: Prisma.AttendanceWhereInput = {
    ...(query.studentId && { studentId: query.studentId }),
    ...(query.classId && { classId: query.classId }),
    ...((query.from || query.to) && {
      date: {
        ...(query.from && { gte: dateOnly(query.from) }),
        ...(query.to && { lte: dateOnly(query.to) }),
      },
    }),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
      skip,
      take: query.limit,
      include: { student: { select: { firstName: true, lastName: true, studentNumber: true } } },
    }),
    prisma.attendance.count({ where }),
  ]);

  return { items: rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

async function assertCanManageClassReadonly(auth: AuthContext, classId: string): Promise<void> {
  if (auth.role === 'SUPER_ADMIN' || auth.role === 'ADMIN') return;
  if (auth.role === 'TEACHER') {
    const classIds = await teacherClassIds(auth.userId);
    if (!classIds.includes(classId)) throw new ForbiddenError('You do not teach this class');
    return;
  }
  // PARENT/STUDENT must query by their own studentId path (enforced upstream)
  throw new ForbiddenError();
}

export async function correctAttendance(
  auth: AuthContext,
  id: string,
  input: CorrectAttendanceInput,
  ctx: AuditContext,
): Promise<unknown> {
  const before = await prisma.attendance.findUnique({ where: { id } });
  if (!before) throw new NotFoundError('Attendance record');
  await assertCanManageClass(auth, before.classId);

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.attendance.update({
      where: { id },
      data: { status: input.status, note: input.note ?? null, recordedBy: auth.userId },
    });
    await writeAudit(
      { ...ctx, action: AuditAction.UPDATE, tableName: 'attendance', recordId: id, before, after: updated },
      tx,
    );
    return updated;
  });
  return after;
}

export interface AttendanceReport {
  classId: string;
  month: string;
  totals: Record<AttendanceStatus, number>;
  perStudent: {
    studentId: string;
    name: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendanceRate: number;
  }[];
}

export async function attendanceReport(
  auth: AuthContext,
  query: AttendanceReportQuery,
): Promise<AttendanceReport> {
  await assertCanManageClassReadonly(auth, query.classId);
  const [year, month] = query.month.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));

  const rows = await prisma.attendance.findMany({
    where: { classId: query.classId, date: { gte: from, lt: to } },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
  });

  const totals: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  const perStudentMap = new Map<
    string,
    { name: string; present: number; absent: number; late: number; excused: number }
  >();

  for (const r of rows) {
    totals[r.status] += 1;
    const key = r.student.id;
    const entry =
      perStudentMap.get(key) ??
      { name: `${r.student.firstName} ${r.student.lastName}`, present: 0, absent: 0, late: 0, excused: 0 };
    if (r.status === 'PRESENT') entry.present += 1;
    else if (r.status === 'ABSENT') entry.absent += 1;
    else if (r.status === 'LATE') entry.late += 1;
    else entry.excused += 1;
    perStudentMap.set(key, entry);
  }

  const perStudent = Array.from(perStudentMap.entries()).map(([studentId, v]) => {
    const total = v.present + v.absent + v.late + v.excused;
    const attended = v.present + v.late;
    return {
      studentId,
      name: v.name,
      present: v.present,
      absent: v.absent,
      late: v.late,
      excused: v.excused,
      attendanceRate: total > 0 ? Math.round((attended / total) * 10000) / 100 : 0,
    };
  });

  return { classId: query.classId, month: query.month, totals, perStudent };
}
