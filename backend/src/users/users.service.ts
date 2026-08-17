import { Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        isActive: true, lastLoginAt: true, createdAt: true,
        roles: { select: { role: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return user;
  }

  async invite(
    companyId: string,
    createdBy: string,
    data: { email: string; firstName: string; lastName: string; tempPassword: string; roleIds: string[] },
  ) {
    const passwordHash = await argon2.hash(data.tempPassword);
    const user = await this.prisma.user.create({
      data: {
        companyId,
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        createdBy,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        companyId, userId: createdBy, action: 'CREATE', entity: 'User',
        entityId: user.id, newValue: { email: user.email },
      },
    });

    return user;
  }

  async setActive(companyId: string, actorId: string, id: string, isActive: boolean) {
    await this.findOne(companyId, id); // ensures tenant match + not deleted
    const user = await this.prisma.user.update({ where: { id }, data: { isActive } });

    await this.prisma.auditLog.create({
      data: {
        companyId, userId: actorId, action: 'UPDATE', entity: 'User',
        entityId: id, newValue: { isActive },
      },
    });
    // deactivating a user also revokes their active sessions
    if (!isActive) {
      await this.prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return user;
  }

  async softDelete(companyId: string, actorId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { companyId, userId: actorId, action: 'UPDATE', entity: 'User', entityId: id, reason: 'soft_delete' },
    });
    return { success: true };
  }
}
