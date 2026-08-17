import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma.service';
import {
  LoginDto,
  RegisterCompanyDto,
  ChangePasswordDto,
  ResetPasswordDto,
  MfaEnableDto,
  MfaDisableDto,
  VerifyMfaLoginDto,
} from './dto/auth.dto';

const SESSION_TTL_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const MFA_ISSUER = 'INDUSTRIAL OS';
const MFA_CHALLENGE_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ----------------------------------------------------------------
  // REGISTER COMPANY (creates tenant + first SUPER_ADMIN user)
  // ----------------------------------------------------------------
  async registerCompany(dto: RegisterCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { name: dto.companyName },
    });
    if (existing) {
      throw new ConflictException('اسم الشركة مستخدم بالفعل');
    }

    const passwordHash = await argon2.hash(dto.password);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const company = await tx.company.create({
        data: { name: dto.companyName },
      });

      const superAdminRole = await tx.role.create({
        data: {
          companyId: company.id,
          code: 'SUPER_ADMIN',
          name: 'Super Admin',
          isSystem: true,
        },
      });

      // seed the rest of the standard system roles (empty permission sets;
      // populated by prisma/seed.ts against the full permission catalogue)
      const standardRoles = [
        'DIRECTOR',
        'PURCHASING_MANAGER',
        'IMPORT_MANAGER',
        'WAREHOUSE_MANAGER',
        'WAREHOUSE_OPERATOR',
        'SALES_MANAGER',
        'SALES_REP',
        'ACCOUNTANT',
        'DELIVERY_MANAGER',
        'TECHNICIAN',
        'AUDITOR',
        'READ_ONLY',
      ] as const;

      for (const code of standardRoles) {
        await tx.role.create({
          data: { companyId: company.id, code, name: code, isSystem: true },
        });
      }

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          roles: { create: [{ roleId: superAdminRole.id }] },
        },
      });

      await tx.auditLog.create({
        data: {
          companyId: company.id,
          userId: user.id,
          action: 'CREATE',
          entity: 'Company',
          entityId: company.id,
          newValue: { name: company.name },
        },
      });

      return { company, user };
    });

    return this.issueSession(result.user.id, result.company.id);
  }

  // ----------------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------------
  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase(), deletedAt: null },
    });

    if (!user || !user.isActive) {
      await this.recordLoginFailure(dto.email, ip, userAgent, 'user_not_found');
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    // brute-force lockout check
    const recentFailures = await this.prisma.loginEvent.count({
      where: {
        companyId: user.companyId,
        email: dto.email.toLowerCase(),
        success: false,
        createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000) },
      },
    });
    if (recentFailures >= MAX_FAILED_ATTEMPTS) {
      throw new UnauthorizedException(
        'تم قفل الحساب مؤقتاً بسبب محاولات دخول فاشلة متكررة. حاول لاحقاً.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.recordLoginFailure(
        dto.email,
        ip,
        userAgent,
        'invalid_password',
        user.companyId,
        user.id,
      );
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    await this.prisma.loginEvent.create({
      data: {
        userId: user.id,
        companyId: user.companyId,
        email: dto.email.toLowerCase(),
        success: true,
        ipAddress: ip,
        userAgent,
      },
    });

    // MFA-enabled accounts don't get a full session from the password step
    // alone — a short-lived challenge token is issued instead, and the real
    // session is only granted after /api/auth/mfa/verify-login succeeds.
    if (user.mfaEnabled) {
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, mfaChallenge: true },
        { expiresIn: MFA_CHALLENGE_TTL },
      );
      return { mfaRequired: true, mfaToken };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueSession(user.id, user.companyId, ip, userAgent);
  }

  // ----------------------------------------------------------------
  // MFA — VERIFY LOGIN (second factor, PHASE 4 "MFA-ready")
  // ----------------------------------------------------------------
  async verifyMfaLogin(dto: VerifyMfaLoginDto, ip?: string, userAgent?: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(dto.mfaToken);
    } catch {
      throw new UnauthorizedException('رمز التحقق منتهي الصلاحية، الرجاء تسجيل الدخول من جديد');
    }
    if (!payload?.mfaChallenge) {
      throw new UnauthorizedException('رمز غير صالح');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('التحقق بخطوتين غير مفعّل لهذا الحساب');
    }

    const valid = authenticator.verify({ token: dto.code, secret: user.mfaSecret });
    if (!valid) {
      await this.recordLoginFailure(user.email, ip, userAgent, 'invalid_mfa_code', user.companyId, user.id);
      throw new UnauthorizedException('رمز التحقق غير صحيح');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user.id, user.companyId, ip, userAgent);
  }

  // ----------------------------------------------------------------
  // MFA — SETUP (generates a pending secret + QR code; not active until
  // confirmed via enableMfa)
  // ----------------------------------------------------------------
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });

    const otpauthUrl = authenticator.keyuri(user.email, MFA_ISSUER, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  // ----------------------------------------------------------------
  // MFA — ENABLE (confirms the pending secret with one real code from the app)
  // ----------------------------------------------------------------
  async enableMfa(userId: string, dto: MfaEnableDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) {
      throw new BadRequestException('يجب بدء إعداد التحقق بخطوتين أولاً (setup)');
    }
    const valid = authenticator.verify({ token: dto.code, secret: user.mfaSecret });
    if (!valid) throw new BadRequestException('رمز التحقق غير صحيح');

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return { success: true };
  }

  // ----------------------------------------------------------------
  // MFA — DISABLE (requires both the current password AND a valid TOTP
  // code — a single stolen credential is not enough to turn protection off)
  // ----------------------------------------------------------------
  async disableMfa(userId: string, dto: MfaDisableDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) throw new ForbiddenException('كلمة المرور غير صحيحة');

    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('التحقق بخطوتين غير مفعّل أصلاً');
    }
    const codeValid = authenticator.verify({ token: dto.code, secret: user.mfaSecret });
    if (!codeValid) throw new ForbiddenException('رمز التحقق غير صحيح');

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    return { success: true };
  }

  private async recordLoginFailure(
    email: string,
    ip?: string,
    userAgent?: string,
    reason?: string,
    companyId?: string,
    userId?: string,
  ) {
    // Login events are tenant-scoped; if the company can't be resolved yet
    // (unknown email) we still log the attempt attached to no company —
    // in production this would go to a global security log instead.
    if (!companyId) return;
    await this.prisma.loginEvent.create({
      data: { userId, companyId, email, success: false, reason, ipAddress: ip, userAgent },
    });
  }

  // ----------------------------------------------------------------
  // SESSION ISSUANCE (opaque refresh token + short-lived JWT access token)
  // ----------------------------------------------------------------
  private async issueSession(
    userId: string,
    companyId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);

    await this.prisma.session.create({
      data: { userId, companyId, tokenHash, expiresAt, ipAddress: ip, userAgent },
    });

    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const permissions = Array.from(
      new Set(
        roles.flatMap((ur: any) => ur.role.permissions.map((rp: any) => rp.permission.key)),
      ),
    );
    const roleCodes = roles.map((ur: any) => ur.role.code);

    const accessToken = await this.jwt.signAsync({
      sub: userId,
      companyId,
      roles: roleCodes,
      permissions,
    });

    return {
      accessToken,
      refreshToken: rawToken,
      expiresAt,
    };
  }

  // ----------------------------------------------------------------
  // LOGOUT — revoke session
  // ----------------------------------------------------------------
  async logout(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async refresh(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('الجلسة منتهية، الرجاء تسجيل الدخول من جديد');
    }
    // rotate: revoke old, issue new
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(session.userId, session.companyId);
  }

  // ----------------------------------------------------------------
  // CHANGE PASSWORD
  // ----------------------------------------------------------------
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) throw new BadRequestException('كلمة المرور الحالية غير صحيحة');

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // revoke all other sessions on password change
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  }

  // ----------------------------------------------------------------
  // PASSWORD RESET FLOW
  // ----------------------------------------------------------------
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: email.toLowerCase() } });
    // Always return success to avoid user-enumeration, even if not found.
    if (!user) return { success: true };

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // TODO: send rawToken via email service (PHASE 8 notifications settings)
    return { success: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new BadRequestException('رابط إعادة تعيين كلمة المرور غير صالح أو منتهي');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }
}
