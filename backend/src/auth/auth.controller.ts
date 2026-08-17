import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  HttpCode,
  Get,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterCompanyDto,
  ChangePasswordDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  MfaEnableDto,
  MfaDisableDto,
  VerifyMfaLoginDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const REFRESH_COOKIE = 'ios_refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/api/auth',
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-company')
  async registerCompany(
    @Body() dto: RegisterCompanyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.registerCompany(dto);
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_OPTS,
      expires: session.expiresAt,
    });
    return { accessToken: session.accessToken };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
    // MFA-enabled accounts get a short-lived challenge instead of a real
    // session — no refresh cookie is set until the second factor succeeds.
    if ('mfaRequired' in session) {
      return session; // { mfaRequired: true, mfaToken }
    }
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_OPTS,
      expires: session.expiresAt,
    });
    return { accessToken: session.accessToken };
  }

  @Post('mfa/verify-login')
  @HttpCode(200)
  async verifyMfaLogin(
    @Body() dto: VerifyMfaLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.verifyMfaLogin(dto, req.ip, req.headers['user-agent']);
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_OPTS,
      expires: session.expiresAt,
    });
    return { accessToken: session.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  async setupMfa(@CurrentUser() user: any) {
    return this.authService.setupMfa(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  async enableMfa(@CurrentUser() user: any, @Body() dto: MfaEnableDto) {
    return this.authService.enableMfa(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  async disableMfa(@CurrentUser() user: any, @Body() dto: MfaDisableDto) {
    return this.authService.disableMfa(user.sub, dto);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await this.authService.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const session = await this.authService.refresh(token);
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...COOKIE_OPTS,
      expires: session.expiresAt,
    });
    return { accessToken: session.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Post('request-password-reset')
  @HttpCode(200)
  async requestReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    return user; // { sub, companyId, roles, permissions }
  }
}
