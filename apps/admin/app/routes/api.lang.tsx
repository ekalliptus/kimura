import type { Route } from './+types/api.lang';
import { adminLang } from '~/lib/admin-i18n';
import { getServerClient } from '~/lib/supabase.server';
import { serializeCookieHeader } from '@supabase/ssr';
import { getCookie } from '~/lib/auth.server';
import { sameOrigin } from '~/lib/request.server';

// POST → toggle admin_lang cookie (id ↔ en). Admins only. Same-origin only.
export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);
  if (!sameOrigin(request)) {
    return Response.json({ error: 'Bad origin' }, { status: 403 });
  }

  const { supabase } = getServerClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const current = adminLang(getCookie(request, 'admin_lang'));
  const next = current === 'id' ? 'en' : 'id';
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    serializeCookieHeader('admin_lang', next, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: import.meta.env.PROD,
      maxAge: 60 * 60 * 24 * 365,
    }),
  );

  // <Form method="post"> from the layout/login does a normal navigation — send
  // them back where they came from so the toggle feels in-place. fetch() callers
  // ignore the redirect body and just re-render.
  const referer = request.headers.get('Referer');
  const back = referer && new URL(referer).host === url.host ? new URL(referer).pathname + new URL(referer).search : '/';
  headers.set('Location', back);
  return new Response(null, { status: 303, headers });
}
