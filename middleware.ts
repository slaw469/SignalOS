import { NextRequest, NextResponse } from "next/server";

const AUTH_USER = "stelaw";
const AUTH_PASS = "844795";

// Paths that bypass auth (OAuth callbacks need to work, cron endpoints use bearer token)
const PUBLIC_PATHS = [
  "/auth/google/callback",
  "/auth/twitter/callback",
  "/api/cron/",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for basic auth
  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");
      if (user === AUTH_USER && pass === AUTH_PASS) {
        return NextResponse.next();
      }
    }
  }

  // Not authenticated — prompt for credentials
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="SignalOS"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
