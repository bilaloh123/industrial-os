import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async listAllPermissions() {
    // full catalogue, grouped by module — used to render the permissions
    // matrix in the RBAC admin screen (PHASE 5)
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  }

  async create(companyId: string, name: string, description?: string) {
    return this.prisma.role.create({ data: { companyId, name, description, code: 'CUSTOM' } });
  }

  async setPermissions(companyId: string, roleId: string, permissionKeys: string[]) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new NotFoundException('الدور غير موجود');
    if (role.isSystem && role.code === 'SUPER_ADMIN') {
      throw new BadRequestException('لا يمكن تعديل صلاحيات SUPER_ADMIN');
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p: any) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async assignToUser(companyId: string, userId: string, roleId: string) {
    const [user, role] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, companyId } }),
      this.prisma.role.findFirst({ where: { id: roleId, companyId } }),
    ]);
    if (!user || !role) throw new NotFoundException('المستخدم أو الدور غير موجود');

    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }
}
