import { useState } from 'react';
import { Form, useSearchParams } from 'react-router';
import type { Route } from './+types/login';
import { adminLang, t as tr } from '~/lib/admin-i18n';
import { getCookie } from '~/lib/auth.server';

export function meta() {
  return [{ title: 'Admin Sign In · Kimura Admin' }];
}

export function loader({ request }: Route.LoaderArgs) {
  return { lang: adminLang(getCookie(request, 'admin_lang')) };
}

export default function Login({ loaderData }: Route.ComponentProps) {
  const { lang } = loaderData;
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const serverError = params.get('error') === 'not_admin' ? tr(lang, 'login.not_admin') : null;

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? tr(lang, 'login.failed'));
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : tr(lang, 'login.failed'));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <a href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary font-display text-xl font-bold text-primary-foreground">木</span>
          <span className="font-display text-xl font-semibold">Kimura Kostay</span>
        </a>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold">{tr(lang, 'login.title')}</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{tr(lang, 'login.subtitle')}</p>
            </div>
            <Form method="post" action="/api/admin/lang" className="contents">
              <button type="submit" className="rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary">
                {lang === 'id' ? 'EN' : 'ID'}
              </button>
            </Form>
          </div>

          {serverError && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{serverError}</p>}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="email">{tr(lang, 'login.email')}</label>
              <input id="email" name="email" type="email" required autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="admin@kimurakostay.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="password">{tr(lang, 'login.password')}</label>
              <input id="password" name="password" type="password" required autoComplete="current-password"
                className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                placeholder="••••••••" />
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <button type="submit" disabled={busy}
              className="flex w-full items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? tr(lang, 'login.submitting') : tr(lang, 'login.submit')}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {tr(lang, 'login.hint')} <code className="rounded bg-secondary px-1 py-0.5">public.admins</code>.
        </p>
      </div>
    </main>
  );
}
