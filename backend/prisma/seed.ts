import { PrismaClient } from '@prisma/client';
import { PERMISSIONS_CATALOGUE, DEFAULT_ROLE_PERMISSIONS } from './permissions-catalogue';
import { DEMO_CATEGORIES, DEMO_ATTRIBUTES } from './demo-catalogue';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permission catalogue...');
  for (const perm of PERMISSIONS_CATALOGUE) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: perm,
      update: { module: perm.module, description: perm.description },
    });
  }

  console.log('Applying default permissions to existing company roles...');
  const companies = await prisma.company.findMany();
  for (const company of companies) {
    for (const [roleCode, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const role = await prisma.role.findUnique({
        where: { companyId_code: { companyId: company.id, code: roleCode as any } },
      }).catch(() => null);
      if (!role) continue;

      const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: permissions.map((p: any) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  console.log('Seeding demo categories + dynamic technical attributes (PHASE 10)...');
  for (const company of companies) {
    for (const categoryName of DEMO_CATEGORIES) {
      const category = await prisma.productCategory.upsert({
        where: { companyId_name: { companyId: company.id, name: categoryName } },
        create: { companyId: company.id, name: categoryName },
        update: {},
      });

      for (const attr of DEMO_ATTRIBUTES[categoryName] ?? []) {
        await prisma.attributeDefinition.upsert({
          where: {
            companyId_categoryId_key: { companyId: company.id, categoryId: category.id, key: attr.key },
          },
          create: {
            companyId: company.id,
            categoryId: category.id,
            key: attr.key,
            label: attr.label,
            type: attr.type,
            unit: attr.unit,
          },
          update: { label: attr.label, type: attr.type, unit: attr.unit },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
