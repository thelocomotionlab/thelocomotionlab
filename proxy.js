import { NextResponse } from "next/server";

/**
 * Homepage hero rotation (temporarily disabled by HERO_COUNT=1)
 */

const HERO_COOKIE = "ll_hero_index";
const HERO_COUNT = 1; // ✅ TEMP: single hero (set back to 2/3/5 later)

function pickDifferentRandom(prevIndex) {
  if (HERO_COUNT <= 1) return 0;

  const randomIndex = Math.floor(Math.random() * HERO_COUNT);
  if (Number.isFinite(prevIndex) && randomIndex === prevIndex) {
    return (randomIndex + 1) % HERO_COUNT;
  }
  return randomIndex;
}

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/") return NextResponse.next();

  // ✅ If single hero, don't set any cookie.
  if (HERO_COUNT <= 1) return NextResponse.next();

  const prevRaw = request.cookies.get(HERO_COOKIE)?.value;
  const prevIndex = prevRaw != null ? Number(prevRaw) : NaN;

  const nextIndex = pickDifferentRandom(prevIndex);

  const response = NextResponse.next();
  response.cookies.set(HERO_COOKIE, String(nextIndex), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}


export const config = {
  matcher: ["/"],
};
