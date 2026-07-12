import { AttendanceStatus, InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFoundError, ForbiddenError } from '@/utils/errors';
import { balanceDue } from '@/modules/fees/fee.calc';
import { studentScopeWhere } from '@/modules/shared/scope';
import type { AuthContext } from '@/types/express';

export interface DashboardData {
  kpis: {
    totalStudents: number;
    activeStudents: number;
    totalStaff: number;
    totalClasses: number;
    attendanceRateToday: number;
    outstandingFees: number;
    collectedThisMonth: number;
  };
  charts: {
    attendanceTrend: { date: string; present: number; absent: number; late: number; excused: number }[];
    feeStatusBreakdown: { status: InvoiceStatus; count: number }[];
    enrollmentByClass: { className: string; count: number }[];
  };
  alerts: { id: string; type: string; message: string; severity: 'info' | 'warning' | 'danger' }[];
}

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getDashboard(auth: AuthContext): Promise<DashboardData> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN' && auth.role !== 'TEACHER') {
    throw new ForbiddenError('Dashboard is available to staff only');
  }
  const scope = await studentScopeWhere(auth);
  const schoolFilter = auth.role === 'SUPER_ADMIN' ? {} : { tenantId: auth.tenantId ?? '__none__' };

  const today = startOfDayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const trendStart = new Date(today);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);

  const [
    totalStudents,
    activeStudents,
    totalStaff,
    totalClasses,
    todayAttendance,
    invoices,
    monthPayments,
    trendRows,
    feeStatusGroups,
    enrollmentClasses,
    overdueCount,
  ] = await Promise.all([
    prisma.student.count({ where: { AND: [scope, { deletedAt: null }] } }),
    prisma.student.count({ where: { AND: [scope, { deletedAt: null, status: 'ACTIVE' }] } }),
    auth.role === 'TEACHER' ? Promise.resolve(0) : prisma.staff.count({ where: { ...schoolFilter, deletedAt: null } }),
    prisma.class.count({ where: { ...schoolFilter, deletedAt: null } }),
    prisma.attendance.groupBy({ by: ['status'], where: { date: today, student: scope }, _count: { _all: true } }),
    prisma.feeInvoice.findMany({ where: { student: { ...scope, deletedAt: null } }, select: { amount: true, amountPaid: true, status: true } }),
    prisma.payment.aggregate({ where: { paymentDate: { gte: monthStart }, invoice: { student: scope } }, _sum: { amountPaid: true } }),
    prisma.attendance.groupBy({ by: ['date', 'status'], where: { date: { gte: trendStart, lte: today }, student: scope }, _count: { _all: true } }),
    prisma.feeInvoice.groupBy({ by: ['status'], where: { student: { ...scope, deletedAt: null } }, _count: { _all: true } }),
    prisma.class.findMany({ where: { ...schoolFilter, deletedAt: null }, select: { name: true, section: true, _count: { select: { enrollments: true } } }, orderBy: { name: 'asc' }, take: 10 }),
    prisma.feeInvoice.count({ where: { status: InvoiceStatus.OVERDUE, student: { ...scope, deletedAt: null } } }),
  ]);

  const presentToday = todayAttendance.find((a) => a.status === AttendanceStatus.PRESENT)?._count._all ?? 0;
  const lateToday = todayAttendance.find((a) => a.status === AttendanceStatus.LATE)?._count._all ?? 0;
  const totalToday = todayAttendance.reduce((acc, a) => acc + a._count._all, 0);
  const attendanceRateToday = totalToday > 0 ? Math.round(((presentToday + lateToday) / totalToday) * 10000) / 100 : 0;

  let outstandingFees = 0;
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.WAIVED) continue;
    outstandingFees += balanceDue(inv.amount.toNumber(), inv.amountPaid.toNumber());
  }

  // Build attendance trend buckets for the last 7 days.
  const trendMap = new Map<string, { present: number; absent: number; late: number; excused: number }>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(trendStart);
    d.setUTCDate(d.getUTCDate() + i);
    trendMap.set(d.toISOString().slice(0, 10), { present: 0, absent: 0, late: 0, excused: 0 });
  }
  for (const row of trendRows) {
    const key = row.date.toISOString().slice(0, 10);
    const bucket = trendMap.get(key);
    if (!bucket) continue;
    const c = row._count._all;
    if (row.status === 'PRESENT') bucket.present += c;
    else if (row.status === 'ABSENT') bucket.absent += c;
    else if (row.status === 'LATE') bucket.late += c;
    else bucket.excused += c;
  }

  const alerts: DashboardData['alerts'] = [];
  if (overdueCount > 0) {
    alerts.push({ id: 'overdue-fees', type: 'FEE', message: `${overdueCount} invoice(s) are overdue`, severity: 'warning' });
  }
  if (attendanceRateToday > 0 && attendanceRateToday < 75) {
    alerts.push({ id: 'low-attendance', type: 'ATTENDANCE', message: `Today's attendance rate is ${attendanceRateToday}%`, severity: 'danger' });
  }

  return {
    kpis: {
      totalStudents,
      activeStudents,
      totalStaff,
      totalClasses,
      attendanceRateToday,
      outstandingFees: Math.round(outstandingFees * 100) / 100,
      collectedThisMonth: monthPayments._sum.amountPaid ? Number(monthPayments._sum.amountPaid) : 0,
    },
    charts: {
      attendanceTrend: Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v })),
      feeStatusBreakdown: feeStatusGroups.map((g) => ({ status: g.status, count: g._count._all })),
      enrollmentByClass: enrollmentClasses.map((c) => ({ className: `${c.name} ${c.section}`, count: c._count.enrollments })),
    },
    alerts,
  };
}

// ── Student Dashboard ──────────────────────────────────────────────────

export interface StudentDashboardData {
  kpis: {
    attendanceToday: string;
    averageGrade: number;
    pendingFees: number;
    myClass: string;
  };
  recentGrades: {
    subject: string;
    score: string;
    maxScore: string;
    gradeLetter: string;
    term: string;
    recordedAt: string;
  }[];
  upcomingFees: {
    id: string;
    invoiceNumber: string;
    feeName: string;
    amount: number;
    amountPaid: number;
    dueDate: string;
    status: string;
  }[];
}

export async function getStudentDashboard(auth: AuthContext): Promise<StudentDashboardData> {
  if (auth.role !== 'STUDENT') throw new ForbiddenError('Student dashboard is for students only');

  const student = await prisma.student.findFirst({
    where: { userId: auth.userId, deletedAt: null },
    include: { enrollments: { include: { class: true }, where: { class: { academicYear: '2025' } }, orderBy: { enrolledAt: 'desc' }, take: 1 } },
  });
  if (!student) throw new NotFoundError('Student profile not found');

  const today = startOfDayUtc();
  const classId = student.enrollments[0]?.classId;

  const [attendanceToday, grades, pendingInvoices] = await Promise.all([
    classId
      ? prisma.attendance.findFirst({
          where: { studentId: student.id, classId, date: today },
          select: { status: true },
        })
      : Promise.resolve(null),
    prisma.grade.findMany({
      where: { studentId: student.id },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { recordedAt: 'desc' },
      take: 10,
    }),
    prisma.feeInvoice.findMany({
      where: { studentId: student.id, status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] } },
      include: { feeStructure: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    }),
  ]);

  const avgGrade =
    grades.length > 0
      ? Math.round(
          (grades.reduce((sum, g) => sum + (g.score.toNumber() / g.maxScore.toNumber()) * 100, 0) / grades.length) * 100,
        ) / 100
      : 0;

  let pendingFees = 0;
  for (const inv of pendingInvoices) {
    pendingFees += balanceDue(inv.amount.toNumber(), inv.amountPaid.toNumber());
  }

  const className = student.enrollments[0]?.class
    ? `${student.enrollments[0].class.name} ${student.enrollments[0].class.section}`
    : '—';

  return {
    kpis: {
      attendanceToday: attendanceToday?.status ?? '—',
      averageGrade: avgGrade,
      pendingFees: Math.round(pendingFees * 100) / 100,
      myClass: className,
    },
    recentGrades: grades.map((g) => ({
      subject: g.subject.name,
      score: g.score.toString(),
      maxScore: g.maxScore.toString(),
      gradeLetter: g.gradeLetter,
      term: g.term,
      recordedAt: g.recordedAt.toISOString(),
    })),
    upcomingFees: pendingInvoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      feeName: inv.feeStructure.name,
      amount: inv.amount.toNumber(),
      amountPaid: inv.amountPaid.toNumber(),
      dueDate: inv.dueDate.toISOString().slice(0, 10),
      status: inv.status,
    })),
  };
}

// ── Parent Dashboard ──────────────────────────────────────────────────

export interface ParentDashboardData {
  children: {
    id: string;
    name: string;
    studentNumber: string;
    className: string;
    attendanceToday: string;
    averageGrade: number;
    pendingFees: number;
  }[];
  overallPendingFees: number;
}

export async function getParentDashboard(auth: AuthContext): Promise<ParentDashboardData> {
  if (auth.role !== 'PARENT') throw new ForbiddenError('Parent dashboard is for parents only');

  const parentLinks = await prisma.parent.findMany({
    where: { userId: auth.userId },
    include: {
      student: {
        include: {
          enrollments: {
            include: { class: true },
            where: { class: { academicYear: '2025' } },
            orderBy: { enrolledAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  });

  if (parentLinks.length === 0) {
    return { children: [], overallPendingFees: 0 };
  }

  const today = startOfDayUtc();
  const studentIds = parentLinks.map((p) => p.student.id);

  const [attendances, allGrades, allInvoices] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, date: today },
      select: { studentId: true, status: true },
    }),
    prisma.grade.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds } },
      _avg: { score: true, maxScore: true },
    }),
    prisma.feeInvoice.findMany({
      where: {
        studentId: { in: studentIds },
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
      },
      select: { studentId: true, amount: true, amountPaid: true, status: true },
    }),
  ]);

  const attendanceMap = new Map(attendances.map((a) => [a.studentId, a.status]));
  const gradeMap = new Map(allGrades.map((g) => [g.studentId, g]));
  const invoiceMap = new Map<string, number>();
  for (const inv of allInvoices) {
    const prev = invoiceMap.get(inv.studentId) ?? 0;
    invoiceMap.set(inv.studentId, prev + balanceDue(inv.amount.toNumber(), inv.amountPaid.toNumber()));
  }

  let overallPendingFees = 0;
  const children = parentLinks.map((pl) => {
    const s = pl.student;
    const classInfo = s.enrollments[0]?.class;
    const className = classInfo ? `${classInfo.name} ${classInfo.section}` : '—';
    const g = gradeMap.get(s.id);
    const avgGrade = g?._avg.score && g?._avg.maxScore ? Math.round((g._avg.score.toNumber() / g._avg.maxScore.toNumber()) * 10000) / 100 : 0;
    const fees = invoiceMap.get(s.id) ?? 0;
    overallPendingFees += fees;

    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      studentNumber: s.studentNumber,
      className,
      attendanceToday: attendanceMap.get(s.id) ?? '—',
      averageGrade: avgGrade,
      pendingFees: Math.round(fees * 100) / 100,
    };
  });

  return { children, overallPendingFees: Math.round(overallPendingFees * 100) / 100 };
}
