import axios from "axios";
import { env } from "../config/env.js";
import { AppError } from "../middlewares/error.middleware.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string | null;
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  return (
    env.GOOGLE_REDIRECT_URI ??
    env.GOOGLE_CALLBACK_URL ??
    `${env.BACKEND_PUBLIC_URL}/api/auth/google/callback`
  );
}

/** URL de consentimiento de Google. `state` protege contra CSRF (se valida en el callback). */
export function buildGoogleAuthUrl(state: string): string {
  if (!isGoogleConfigured()) {
    throw new AppError("Google OAuth no está configurado en el servidor", 503);
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Intercambia el código por tokens y devuelve el perfil del usuario (todo server-side). */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!isGoogleConfigured()) {
    throw new AppError("Google OAuth no está configurado en el servidor", 503);
  }

  const tokenRes = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID as string,
      client_secret: env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
  );

  const accessToken = tokenRes.data?.access_token as string | undefined;
  if (!accessToken) {
    throw new AppError("Google no devolvió un token válido", 502);
  }

  const userRes = await axios.get(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10_000,
  });

  const info = userRes.data as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
  };

  if (!info.sub || !info.email) {
    throw new AppError("No se pudo obtener el perfil de Google", 502);
  }

  return {
    googleId: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: Boolean(info.email_verified),
    firstName: info.given_name || info.name || "Usuario",
    lastName: info.family_name || null,
  };
}
