import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  companySlug?: string; // for multi-tenant login resolution if needed
}

export class RegisterCompanyDto {
  // Registers a brand-new company + its first DIRECTOR/SUPER_ADMIN user.
  @IsString()
  companyName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

// ---- MFA (TOTP — PHASE 4 "MFA-ready") ----

export class MfaEnableDto {
  @IsString()
  @MinLength(6)
  code!: string; // 6-digit code from the authenticator app, confirming the pending secret
}

export class MfaDisableDto {
  @IsString()
  password!: string;

  @IsString()
  @MinLength(6)
  code!: string;
}

export class VerifyMfaLoginDto {
  @IsString()
  mfaToken!: string; // short-lived challenge token returned by /login when MFA is required

  @IsString()
  @MinLength(6)
  code!: string;
}
