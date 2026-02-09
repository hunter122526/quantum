import { NextResponse, NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const appCode = process.env.ALICE_APP_CODE;
  if (!appCode) {
    return NextResponse.json({ ok: false, message: 'ALICE_APP_CODE not configured' }, { status: 500 });
  }

  const redirectUrl = `https://ant.aliceblueonline.com/?appcode=${encodeURIComponent(appCode)}`;

  const res = NextResponse.redirect(redirectUrl);
  
  // Set a cookie to indicate this is a master account OAuth flow
  res.cookies.set('alice_oauth_is_master', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 5, // 5 minutes - short lived since we expect immediate redirect
    sameSite: 'lax',
    path: '/',
  });

  return res;
}

