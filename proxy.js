import { NextResponse } from "next/server";

/**
 * Homepage hero rotation
 *
 * Next.js 16+: the old `middleware.*` convention is renamed to `proxy.*`.
 * We store a hero index in a cookie and choose a different one on each visit to "/".
 */

const HERO_COOKIE = "ll_hero_index";
const HERO_COUNT = 2; // Keep in sync with HEROES array in app/page.js

function pickDifferentRandom(prevIndex) {
  if (HERO_COUNT <= 1) return 0;

  const randomIndex = Math.floor(Math.random() * HERO_COUNT);

  if (Number.isFinite(prevIndex) && randomIndex === prevIndex) {
    return (randomIndex + 1) % HERO_COUNT;
  }
  return randomIndex;
}

// ✅ IMPORTANT: Next.js 16 expects `export function proxy(...)`
export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Only run on homepage
  if (pathname !== "/") return NextResponse.next();

  const prevRaw = request.cookies.get(HERO_COOKIE)?.value;
  const prevIndex = prevRaw != null ? Number(prevRaw) : NaN;

  const nextIndex = pickDifferentRandom(prevIndex);

  const response = NextResponse.next();

  response.cookies.set(HERO_COOKIE, String(nextIndex), {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return response;
}

export const config = {
  matcher: ["/"],
};
