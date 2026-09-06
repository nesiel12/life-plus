import { withAuth } from "next-auth/middleware";
import { sessionCookieConfig } from "@/lib/sessionCookie";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  // Must match lib/auth.ts's authOptions.cookies exactly, or withAuth's
  // getToken() looks for a cookie name the sign-in route never wrote — see
  // lib/sessionCookie.ts for the mechanism this fixes.
  cookies: sessionCookieConfig,
});

export const config = {
  matcher: ["/", "/timeline/:path*", "/areas/:path*", "/calendar/:path*"],
};
