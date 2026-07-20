import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // No accessToken/refreshToken here on purpose — those scopes must never
    // reach client JS. See lib/auth.ts's session callback.
    error?: string;
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
  }
}
