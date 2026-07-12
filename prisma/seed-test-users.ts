import 'dotenv/config';
import { PrismaClient, Role, Gender, StudentStatus, AttendanceStatus, InvoiceStatus, FeeFrequency } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT = 12;
const PASSWORD = 'Test1234!';

async function main(): Promise<void> {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) { console.error('No tenant found. Run seed-reset first.'); return; }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  const pw = await bcrypt.hash(PASSWORD, SALT);

  // ── Teacher ──
  const teacherUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'teacher@test.com' } },
    update: {},
    create: {
      email: 'teacher@test.com', passwordHash: pw, role: Role.TEACHER,
      tenantId: tenant.id, isVerified: true,
    },
  });
  const teacher = await prisma.staff.upsert({
    where: { userId: teacherUser.id },
    update: {},
    create: {
      tenantId: tenant.id, userId: teacherUser.id, displayId: 'TCH-001',
      employeeNumber: 'TCH-001', firstName: 'Sarah', lastName: 'Johnson',
      role: 'TEACHER', phone: '+1234567890', joinDate: new Date(),
    },
  });
  console.log(`Teacher: teacher@test.com / ${PASSWORD} (staff: ${teacher.id})`);

  // ── Student ──
  const studentUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'student@test.com' } },
    update: {},
    create: {
      email: 'student@test.com', passwordHash: pw, role: Role.STUDENT,
      tenantId: tenant.id, isVerified: true,
    },
  });
  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      tenantId: tenant.id, userId: studentUser.id, displayId: 'STU-001',
      studentNumber: 'STU-001', firstName: 'James', lastName: 'Wilson',
      phone: '+1234567891', dob: new Date('2008-05-15'), gender: Gender.MALE,
      admissionDate: new Date(), status: StudentStatus.ACTIVE,
    },
  });
  console.log(`Student: student@test.com / ${PASSWORD} (student: ${student.id})`);

  // ── Class ──
  const klass = await prisma.class.upsert({
    where: { tenantId_name_section_academicYear: { tenantId: tenant.id, name: 'Grade 10', section: 'A', academicYear: '2026' } },
    update: { classTeacherId: teacher.id },
    create: {
      tenantId: tenant.id, displayId: 'CLS-001', name: 'Grade 10', section: 'A',
      academicYear: '2026', classTeacherId: teacher.id, capacity: 40,
    },
  });
  console.log(`Class: ${klass.name} ${klass.section} (${klass.id})`);

  // ── Enroll student ──
  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { classId: klass.id, studentId: student.id },
  });
  if (!existingEnrollment) {
    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id, classId: klass.id, studentId: student.id, academicYear: '2026',
      },
    });
  }

  // ── Subjects ──
  const math = await prisma.subject.upsert({
    where: { tenantId_classId_code: { tenantId: tenant.id, classId: klass.id, code: 'MATH101' } },
    update: { teacherId: teacher.id },
    create: { tenantId: tenant.id, classId: klass.id, name: 'Mathematics', code: 'MATH101', description: 'Algebra, Geometry, and Statistics', teacherId: teacher.id },
  });
  const english = await prisma.subject.upsert({
    where: { tenantId_classId_code: { tenantId: tenant.id, classId: klass.id, code: 'ENG101' } },
    update: { teacherId: teacher.id },
    create: { tenantId: tenant.id, classId: klass.id, name: 'English', code: 'ENG101', description: 'Grammar, Literature, and Writing', teacherId: teacher.id },
  });
  const science = await prisma.subject.upsert({
    where: { tenantId_classId_code: { tenantId: tenant.id, classId: klass.id, code: 'SCI101' } },
    update: {},
    create: { tenantId: tenant.id, classId: klass.id, name: 'Science', code: 'SCI101', description: 'Physics, Chemistry, and Biology' },
  });
  console.log(`Subjects: ${math.code}, ${english.code}, ${science.code}`);

  // ── Attendance (last 5 days) ──
  const existingAtt = await prisma.attendance.findFirst({ where: { studentId: student.id, classId: klass.id } });
  if (!existingAtt) {
    const today = new Date();
    const statuses = [AttendanceStatus.PRESENT, AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.PRESENT, AttendanceStatus.ABSENT];
    for (let i = 0; i < 5; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      await prisma.attendance.create({
        data: {
          tenantId: tenant.id, studentId: student.id, classId: klass.id,
          date: d, status: statuses[i] as AttendanceStatus, recordedBy: teacherUser.id,
        },
      });
    }
    console.log('Attendance: 5 days created');
  } else {
    console.log('Attendance: already exists, skipped');
  }

  // ── Grades ──
  const existingGrade = await prisma.grade.findFirst({ where: { studentId: student.id } });
  if (!existingGrade) {
    await prisma.grade.createMany({
      data: [
        { tenantId: tenant.id, studentId: student.id, subjectId: math.id, term: 'Term 1', score: 85, maxScore: 100, gradeLetter: 'A', recordedBy: teacherUser.id, recordedAt: new Date() },
        { tenantId: tenant.id, studentId: student.id, subjectId: english.id, term: 'Term 1', score: 78, maxScore: 100, gradeLetter: 'B+', recordedBy: teacherUser.id, recordedAt: new Date() },
        { tenantId: tenant.id, studentId: student.id, subjectId: science.id, term: 'Term 1', score: 92, maxScore: 100, gradeLetter: 'A+', recordedBy: teacherUser.id, recordedAt: new Date() },
      ],
    });
    console.log('Grades: 3 records created');
  } else {
    console.log('Grades: already exist, skipped');
  }

  // ── Parent ──
  const parentUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'parent@test.com' } },
    update: {},
    create: {
      email: 'parent@test.com', passwordHash: pw, role: Role.PARENT,
      tenantId: tenant.id, isVerified: true,
    },
  });
  await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: {
      tenantId: tenant.id, userId: parentUser.id,
      studentId: student.id, relationship: 'Father',
      phone: '+1234567892', isPrimary: true,
    },
  });
  console.log(`Parent: parent@test.com / ${PASSWORD}`);

  // ── Fee Invoice ──
  const existingFeeStruct = await prisma.feeStructure.findFirst({ where: { tenantId: tenant.id } });
  let feeStruct = existingFeeStruct;
  if (!feeStruct) {
    feeStruct = await prisma.feeStructure.create({
      data: {
        tenantId: tenant.id, name: 'Tuition Fee', amount: 500,
        frequency: FeeFrequency.TERMLY, academicYear: '2026',
      },
    });
  }
  const existingInvoice = await prisma.feeInvoice.findFirst({ where: { studentId: student.id } });
  if (!existingInvoice) {
    await prisma.feeInvoice.create({
      data: {
        tenantId: tenant.id, studentId: student.id, feeStructureId: feeStruct.id,
        dueDate: new Date('2026-09-30'), amount: 500, amountPaid: 200,
        status: InvoiceStatus.PARTIAL, invoiceNumber: 'INV-00001',
      },
    });
    console.log('Fee: Invoice INV-00001 ($500, $200 paid)');
  } else {
    console.log('Fee: Invoice already exists, skipped');
  }

  console.log('\n=== TEST CREDENTIALS ===');
  console.log('All accounts use password: Test1234!');
  console.log('Teacher: teacher@test.com');
  console.log('Student: student@test.com');
  console.log('Parent:  parent@test.com');
  console.log('========================');
}

main().catch(console.error).finally(() => prisma.$disconnect());
