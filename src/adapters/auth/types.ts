export interface AuthAdapter {
  generateToken(email: string): string;
  validateToken(token: string): TokenValidation;
}

export interface TokenValidation {
  valid: boolean;
  email?: string;
}
