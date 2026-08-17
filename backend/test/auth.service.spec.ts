import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma.service';

/**
 * Unit tests for AuthService. PrismaService is fully mocked — no real
 * database connection required, so these run in any environment
 * (including CI without Postgres).
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtMock: any;

  const FAKE_USER = {
    id: 'user_1',
    companyId: 'company_1',
    email: 'director@idm.ma',
    isActive: true,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn() },
      company: { findFirst: jest.fn(), create: jest.fn() },
      role: { create: jest.fn() },
      loginEvent: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
      session: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      userRole: { findMany: jest.fn().mockResolvedValue([]) },
      passwordReset: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (arg) => {
        if (typeof arg === 'function') {
          return arg(prisma);
        }
        return Promise.all(arg);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('fake.jwt.token'),
            verifyAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwtMock = moduleRef.get(JwtService);
  });

  describe('login', () => {
    it('rejects when the user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@idm.ma', password: 'whatever1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the password is wrong, and logs the failed attempt', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash });

      await expect(
        service.login({ email: FAKE_USER.email, password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.loginEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ success: false, reason: 'invalid_password' }),
        }),
      );
    });

    it('locks the account after 5 recent failed attempts, even with correct password', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash });
      prisma.loginEvent.count.mockResolvedValue(5);

      await expect(
        service.login({ email: FAKE_USER.email, password: 'correct-password' }),
      ).rejects.toThrow(/تم قفل الحساب/);
    });

    it('succeeds with correct credentials and issues a session', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash });

      const result: any = await service.login(
        { email: FAKE_USER.email, password: 'correct-password' },
        '127.0.0.1',
        'jest-test-agent',
      );

      expect(result.accessToken).toBe('fake.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.loginEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
      );
      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('does not treat an inactive user as loggable-in', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, isActive: false });
      await expect(
        service.login({ email: FAKE_USER.email, password: 'whatever1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('rejects when current password is incorrect', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: FAKE_USER.id, passwordHash });

      await expect(
        service.changePassword(FAKE_USER.id, {
          currentPassword: 'wrong',
          newPassword: 'brandNewPass1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('revokes all active sessions after a successful password change', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: FAKE_USER.id, passwordHash });
      prisma.user.update.mockResolvedValue({});

      await service.changePassword(FAKE_USER.id, {
        currentPassword: 'correct-password',
        newPassword: 'brandNewPass1',
      });

      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: FAKE_USER.id, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('returns success even for an unknown email (no user enumeration)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await service.requestPasswordReset('ghost@idm.ma');
      expect(result).toEqual({ success: true });
      expect(prisma.passwordReset.create).not.toHaveBeenCalled();
    });

    it('creates a reset token for a known user', async () => {
      prisma.user.findFirst.mockResolvedValue(FAKE_USER);
      await service.requestPasswordReset(FAKE_USER.email);
      expect(prisma.passwordReset.create).toHaveBeenCalled();
    });
  });

  describe('registerCompany', () => {
    it('creates the company, all standard roles, and a SUPER_ADMIN user', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      prisma.company.create.mockResolvedValue({ id: 'company_new', name: 'Test Co' });
      prisma.role.create.mockResolvedValue({ id: 'role_super_admin' });
      prisma.user.create.mockResolvedValue({ id: 'user_new' });

      await service.registerCompany({
        companyName: 'Test Co',
        email: 'owner@testco.ma',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
      });

      // 1 SUPER_ADMIN + 12 standard roles = 13 role creations
      expect(prisma.role.create).toHaveBeenCalledTimes(13);
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate company name', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.registerCompany({
          companyName: 'Test Co',
          email: 'owner@testco.ma',
          password: 'password123',
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(/مستخدم بالفعل/);
    });
  });

  describe('login — MFA required (PHASE 4 "MFA-ready")', () => {
    it('issues a short-lived challenge instead of a full session for an MFA-enabled account, and does NOT log the user in yet', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: true, mfaSecret: 'SECRETBASE32' });

      const result = await service.login({ email: FAKE_USER.email, password: 'correct-password' });

      expect(result).toEqual({ mfaRequired: true, mfaToken: 'fake.jwt.token' });
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ lastLoginAt: expect.anything() }) }),
      );
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('signs the challenge token with a short expiry and a distinguishing claim', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: true, mfaSecret: 'SECRETBASE32' });

      await service.login({ email: FAKE_USER.email, password: 'correct-password' });

      expect(jwtMock.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: FAKE_USER.id, mfaChallenge: true }),
        expect.objectContaining({ expiresIn: '5m' }),
      );
    });

    it('does not require MFA for an account with mfaEnabled=false (existing behavior unaffected)', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findFirst.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: false });

      const result: any = await service.login({ email: FAKE_USER.email, password: 'correct-password' });
      expect('mfaRequired' in result).toBe(false);
      expect(result.accessToken).toBe('fake.jwt.token');
    });
  });

  describe('verifyMfaLogin() — the real second factor', () => {
    const { authenticator } = require('otplib');
    const secret = authenticator.generateSecret();

    it('rejects an expired or tampered challenge token', async () => {
      jwtMock.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(
        service.verifyMfaLogin({ mfaToken: 'bad.token', code: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token that is not actually an MFA challenge (defense in depth)', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: 'user_1', companyId: 'company_1' }); // a normal access token payload
      await expect(
        service.verifyMfaLogin({ mfaToken: 'some.token', code: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect TOTP code with a real (non-forged) verification', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: FAKE_USER.id, mfaChallenge: true });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaEnabled: true, mfaSecret: secret });

      await expect(
        service.verifyMfaLogin({ mfaToken: 'valid.challenge', code: '000000' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('accepts a genuinely correct TOTP code and issues a real session', async () => {
      const validCode = authenticator.generate(secret);
      jwtMock.verifyAsync.mockResolvedValue({ sub: FAKE_USER.id, mfaChallenge: true });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaEnabled: true, mfaSecret: secret });

      const result = await service.verifyMfaLogin({ mfaToken: 'valid.challenge', code: validCode });
      expect(result.accessToken).toBe('fake.jwt.token');
      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('rejects if the account no longer has MFA enabled (e.g. disabled mid-flow)', async () => {
      jwtMock.verifyAsync.mockResolvedValue({ sub: FAKE_USER.id, mfaChallenge: true });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaEnabled: false, mfaSecret: null });

      await expect(
        service.verifyMfaLogin({ mfaToken: 'valid.challenge', code: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('setupMfa() — generates a pending secret (not yet active)', () => {
    it('stores a new secret with mfaEnabled left false until confirmed', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, email: 'director@idm.ma' });
      prisma.user.update.mockResolvedValue({});

      const result = await service.setupMfa(FAKE_USER.id);

      expect(result.secret).toBeTruthy();
      expect(result.otpauthUrl).toContain('otpauth://');
      expect(result.qrCodeDataUrl).toContain('data:image/png;base64');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: false }) }),
      );
    });
  });

  describe('enableMfa() — confirms the pending secret with one real code', () => {
    const { authenticator } = require('otplib');

    it('rejects if setupMfa was never called (no pending secret)', async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaSecret: null });
      await expect(service.enableMfa(FAKE_USER.id, { code: '123456' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an incorrect confirmation code', async () => {
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaSecret: secret });
      await expect(service.enableMfa(FAKE_USER.id, { code: '000000' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: true }) }),
      );
    });

    it('activates MFA once the correct code from the authenticator app is provided', async () => {
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, mfaSecret: secret });
      prisma.user.update.mockResolvedValue({});

      const result = await service.enableMfa(FAKE_USER.id, { code: validCode });
      expect(result).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mfaEnabled: true } }),
      );
    });
  });

  describe('disableMfa() — requires BOTH password AND a valid TOTP code', () => {
    const { authenticator } = require('otplib');

    it('rejects with the wrong password, even if the TOTP code is correct (never trusts a single factor to turn protection off)', async () => {
      const passwordHash = await argon2.hash('correct-password');
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: true, mfaSecret: secret });

      await expect(
        service.disableMfa(FAKE_USER.id, { password: 'wrong-password', code: validCode }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with the right password but a wrong/forged TOTP code', async () => {
      const passwordHash = await argon2.hash('correct-password');
      const secret = authenticator.generateSecret();
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: true, mfaSecret: secret });

      await expect(
        service.disableMfa(FAKE_USER.id, { password: 'correct-password', code: '000000' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('disables MFA and clears the secret only when BOTH factors are correct', async () => {
      const passwordHash = await argon2.hash('correct-password');
      const secret = authenticator.generateSecret();
      const validCode = authenticator.generate(secret);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: true, mfaSecret: secret });
      prisma.user.update.mockResolvedValue({});

      const result = await service.disableMfa(FAKE_USER.id, { password: 'correct-password', code: validCode });
      expect(result).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { mfaEnabled: false, mfaSecret: null } }),
      );
    });

    it('rejects disabling MFA on an account where it is not even enabled', async () => {
      const passwordHash = await argon2.hash('correct-password');
      prisma.user.findUniqueOrThrow.mockResolvedValue({ ...FAKE_USER, passwordHash, mfaEnabled: false, mfaSecret: null });

      await expect(
        service.disableMfa(FAKE_USER.id, { password: 'correct-password', code: '123456' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
