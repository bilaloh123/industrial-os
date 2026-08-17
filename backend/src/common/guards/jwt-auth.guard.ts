import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Validates the Bearer access token and attaches the decoded payload
 * (sub, companyId, roles, permissions) to req.user.
 * This is the single source of truth for "who is making this request
 * and which company do they belong to" — every downstream service
 * MUST scope its queries by req.user.companyId (PHASE 3: tenant isolation).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const authHeader: string | undefined = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('مطلوب تسجيل الدخول');
    }
    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = await this.jwt.verifyAsync(token);
      // MFA challenge tokens (issued mid-login, before the second factor is
      // verified) must never be usable as a real access token — they carry
      // no roles/permissions/companyId on purpose, but this is an explicit
      // safeguard rather than relying on downstream checks failing silently.
      if (payload?.mfaChallenge) {
        throw new UnauthorizedException('يجب إتمام التحقق بخطوتين أولاً');
      }
      req.user = payload; // { sub, companyId, roles, permissions }
      return true;
    } catch {
      throw new UnauthorizedException('جلسة غير صالحة أو منتهية');
    }
  }
}
