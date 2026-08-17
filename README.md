# INDUSTRIAL OS

**Industrial Distribution Intelligence Platform** — نظام ERP مستقل 100% مخصص لشركات الاستيراد والتوزيع الصناعي.

هذا المستودع يحتوي حالياً على **PHASE 1 فقط**: Architecture + Database + Authentication + RBAC الأساسي، طبقاً لترتيب التنفيذ المحدد في مواصفات المشروع (PHASE 67 وPHASE 68).

---

## البنية

```
industrial-os/
├── backend/          # NestJS + Prisma + PostgreSQL API
│   ├── prisma/
│   │   ├── schema.prisma            # نموذج قاعدة البيانات (multi-tenant)
│   │   ├── permissions-catalogue.ts # كتالوج الصلاحيات RBAC
│   │   └── seed.ts                  # بذر الصلاحيات + ربطها بالأدوار
│   └── src/
│       ├── auth/                    # تسجيل الدخول/الخروج، الجلسات، إعادة تعيين كلمة المرور
│       ├── users/                   # إدارة المستخدمين (tenant-scoped)
│       ├── roles/                   # إدارة الأدوار والصلاحيات (RBAC)
│       ├── companies/               # بيانات وإعدادات الشركة
│       └── common/guards|decorators # JwtAuthGuard, PermissionsGuard, tenant isolation
├── frontend/         # Next.js + TypeScript + Tailwind
│   └── app/login, app/dashboard
└── docker-compose.yml
```

## التشغيل محلياً

```bash
cp backend/.env.example backend/.env
# عدّل DATABASE_URL و JWT_SECRET

docker compose up -d postgres redis

cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev        # http://localhost:4000  |  Swagger: /api/docs

cd ../frontend
npm install
npm run dev               # http://localhost:3000/login
```

## أول استخدام

```
POST /api/auth/register-company
{
  "companyName": "Industrial Distribution Morocco",
  "email": "director@example.com",
  "password": "ChangeMe123!",
  "firstName": "Ahmed",
  "lastName": "Director"
}
```

هذا ينشئ الشركة + كل الأدوار القياسية (SUPER_ADMIN, DIRECTOR, ...) + أول مستخدم بصلاحية SUPER_ADMIN.
بعدها شغّل `npx prisma db seed` لربط الأدوار بكتالوج الصلاحيات الافتراضي.
