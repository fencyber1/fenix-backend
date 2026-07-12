import { AuditAction, InvitationStatus, type Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/utils/errors';
import { generateRandomToken, sha256, hashPassword } from '@/utils/password';
import { writeAudit, type AuditContext } from '@/modules/audit/audit.service';
import type { AuthContext } from '@/types/express';
import type { InviteUserInput, RegisterWithTokenInput } from './invitations.schemas';

const TOKEN_TTL_DAYS = 7;

/** Generate the next display ID for a role within a tenant. */
async function nextDisplayId(role: Role, tenantId: string): Promise<string> {
  const prefixMap: Record<string, string> = {
    TEACHER: 'TEACHER',
    STUDENT: 'STU',
    PARENT: 'PAR',
  };
  const prefix = prefixMap[role];
  if (!prefix) throw new BadRequestError(`Cannot generate display ID for role ${role}`);

  let count: number;
  if (role === 'TEACHER') {
    count = await prisma.staff.count({ where: { tenantId, deletedAt: null } });
  } else if (role === 'STUDENT') {
    count = await prisma.student.count({ where: { tenantId, deletedAt: null } });
  } else {
    count = await prisma.parent.count({ where: { tenantId } });
  }
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

/** Admin invites a user (teacher/student/parent). Returns the raw token and invite URL. */
export async function inviteUser(
  auth: AuthContext,
  input: InviteUserInput,
  ctx: AuditContext,
  appUrl: string,
): Promise<{ token: string; inviteUrl: string; expiresAt: Date }> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    throw new ForbiddenError('Only admins can invite users');
  }
  const tenantId = auth.tenantId;
  if (!tenantId) throw new ForbiddenError('No tenant associated');

  // Check if email already has an active user in this tenant
  const existingUser = await prisma.user.findFirst({
    where: { tenantId, email: input.email, deletedAt: null },
    select: { id: true },
  });
  if (existingUser) {
    throw new BadRequestError('A user with this email already exists in this school');
  }

  // Check for a pending invitation for this email+role in this tenant
  const existingInvite = await prisma.invitationToken.findFirst({
    where: { tenantId, email: input.email, role: input.role, status: InvitationStatus.PENDING },
    select: { id: true },
  });
  if (existingInvite) {
    // Revoke the old one
    await prisma.invitationToken.update({
      where: { id: existingInvite.id },
      data: { status: InvitationStatus.REVOKED },
    });
  }

  const rawToken = generateRandomToken(40);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const record = await prisma.invitationToken.create({
    data: {
      tenantId,
      tokenHash,
      role: input.role,
      email: input.email,
      name: input.name,
      roleData: input.roleData ? JSON.parse(JSON.stringify(input.roleData)) : undefined,
      expiresAt,
    },
  });

  await writeAudit({
    ...ctx,
    action: AuditAction.CREATE,
    tableName: 'invitation_tokens',
    recordId: record.id,
    after: { email: input.email, role: input.role, name: input.name },
  });

  const inviteUrl = `${appUrl}/signup/?token=${rawToken}`;

  return { token: rawToken, inviteUrl, expiresAt };
}

/** Validate an invitation token and return its data. */
export async function validateToken(rawToken: string): Promise<{
  valid: boolean;
  role?: Role;
  email?: string;
  name?: string;
  schoolName?: string;
  roleData?: Record<string, unknown>;
}> {
  const tokenHash = sha256(rawToken);
  const record = await prisma.invitationToken.findUnique({
    where: { tokenHash },
    include: { tenant: { select: { name: true } } },
  });

  if (!record) return { valid: false };
  if (record.status !== InvitationStatus.PENDING) return { valid: false };
  if (new Date() > record.expiresAt) {
    // Mark as expired
    await prisma.invitationToken.update({
      where: { id: record.id },
      data: { status: InvitationStatus.EXPIRED },
    });
    return { valid: false };
  }

  return {
    valid: true,
    role: record.role,
    email: record.email,
    name: record.name,
    roleData: (record.roleData as Record<string, unknown>) ?? {},
  };
}

/** Register a new user via invitation token. */
export async function registerWithToken(
  input: RegisterWithTokenInput,
  meta: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ userId: string; role: Role; tenantId: string; displayId: string }> {
  const tokenHash = sha256(input.token);
  const record = await prisma.invitationToken.findUnique({
    where: { tokenHash },
  });

  if (!record) throw new BadRequestError('Invalid invitation token');
  if (record.status !== InvitationStatus.PENDING) throw new BadRequestError('Invitation token has already been used or revoked');
  if (new Date() > record.expiresAt) {
    await prisma.invitationToken.update({ where: { id: record.id }, data: { status: InvitationStatus.EXPIRED } });
    throw new BadRequestError('Invitation token has expired');
  }

  // Check email not already registered
  const existingUser = await prisma.user.findFirst({
    where: { tenantId: record.tenantId, email: record.email, deletedAt: null },
    select: { id: true },
  });
  if (existingUser) throw new BadRequestError('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const roleData = (record.roleData as Record<string, unknown>) ?? {};

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create user
    const user = await tx.user.create({
      data: {
        email: record.email,
        passwordHash,
        role: record.role,
        tenantId: record.tenantId,
        isVerified: true,
      },
    });

    let displayId = '';

    if (record.role === 'TEACHER') {
      displayId = await nextDisplayId('TEACHER', record.tenantId);
      await tx.staff.create({
        data: {
          tenantId: record.tenantId,
          userId: user.id,
          displayId,
          employeeNumber: displayId,
          firstName: record.name.split(' ')[0] ?? record.name,
          lastName: record.name.split(' ').slice(1).join(' ') || '',
          role: 'TEACHER',
          phone: (input.phone as string) || (roleData.phone as string) || null,
          joinDate: new Date(),
        },
      });
    } else if (record.role === 'STUDENT') {
      displayId = await nextDisplayId('STUDENT', record.tenantId);
      const student = await tx.student.create({
        data: {
          tenantId: record.tenantId,
          userId: user.id,
          displayId,
          studentNumber: displayId,
          firstName: (roleData.firstName as string) || (record.name.split(' ')[0] ?? record.name),
          lastName: (roleData.lastName as string) || record.name.split(' ').slice(1).join(' ') || '',
          phone: (input.phone as string) || null,
          dob: new Date('2000-01-01'),
          gender: 'OTHER',
          admissionDate: new Date(),
        },
      });

      // Auto-enroll in class if classId is in roleData
      const classId = roleData.classId as string | undefined;
      if (classId) {
        const klass = await tx.class.findFirst({
          where: { id: classId, tenantId: record.tenantId, deletedAt: null },
          select: { id: true, capacity: true, academicYear: true },
        });
        if (klass) {
          const enrollmentCount = await tx.enrollment.count({ where: { classId } });
          if (enrollmentCount < klass.capacity) {
            await tx.enrollment.create({
              data: {
                tenantId: record.tenantId,
                classId,
                studentId: student.id,
                academicYear: klass.academicYear,
              },
            });
          }
        }
      }
    } else if (record.role === 'PARENT') {
      displayId = await nextDisplayId('PARENT', record.tenantId);
      // Link to student if studentId is in roleData
      const studentId = roleData.studentId as string | undefined;
      let linkedStudentId: string | undefined;
      if (studentId) {
        const student = await tx.student.findFirst({
          where: { id: studentId, tenantId: record.tenantId, deletedAt: null },
          select: { id: true },
        });
        linkedStudentId = student?.id;
      }
      await tx.parent.create({
        data: {
          tenantId: record.tenantId,
          userId: user.id,
          studentId: linkedStudentId ?? user.id, // placeholder if no student linked
          relationship: (roleData.relationship as string) || 'Parent',
          phone: (input.phone as string) || (roleData.phone as string) || '',
          isPrimary: true,
        },
      });
    }

    // 2. Mark token as used
    await tx.invitationToken.update({
      where: { id: record.id },
      data: { status: InvitationStatus.USED, usedAt: new Date() },
    });

    // 3. Audit
    await writeAudit({
      tenantId: record.tenantId,
      actorId: user.id,
      action: AuditAction.CREATE,
      tableName: 'users',
      recordId: user.id,
      after: { email: record.email, role: record.role, displayId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }, tx);

    return { userId: user.id, role: record.role, tenantId: record.tenantId, displayId };
  });

  return result;
}

/** List all invitations for a tenant (admin only). */
export async function listInvitations(
  auth: AuthContext,
  params: { role?: Role; status?: InvitationStatus; page?: number; limit?: number },
): Promise<{ data: unknown[]; total: number }> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    throw new ForbiddenError('Only admins can view invitations');
  }
  const tenantId = auth.tenantId;
  if (!tenantId) throw new ForbiddenError('No tenant associated');

  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const where: Record<string, unknown> = { tenantId };
  if (params.role) where.role = params.role;
  if (params.status) where.status = params.status;

  const [data, total] = await Promise.all([
    prisma.invitationToken.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    }),
    prisma.invitationToken.count({ where }),
  ]);

  return { data, total };
}

/** Revoke an invitation (admin only). */
export async function revokeInvitation(
  auth: AuthContext,
  tokenId: string,
  ctx: AuditContext,
): Promise<void> {
  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    throw new ForbiddenError('Only admins can revoke invitations');
  }
  const tenantId = auth.tenantId;
  if (!tenantId) throw new ForbiddenError('No tenant associated');

  const record = await prisma.invitationToken.findFirst({
    where: { id: tokenId, tenantId },
  });
  if (!record) throw new NotFoundError('Invitation');
  if (record.status !== InvitationStatus.PENDING) {
    throw new BadRequestError('Invitation is not pending');
  }

  await prisma.invitationToken.update({
    where: { id: tokenId },
    data: { status: InvitationStatus.REVOKED },
  });

  await writeAudit({
    ...ctx,
    action: AuditAction.DELETE,
    tableName: 'invitation_tokens',
    recordId: tokenId,
    before: { email: record.email, role: record.role, status: record.status },
  });
}
