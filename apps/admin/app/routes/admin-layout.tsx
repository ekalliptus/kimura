import { useState } from 'react';
import { Outlet, NavLink, Form, useLoaderData, useLocation } from 'react-router';
import type { Route } from './+types/admin-layout';
import { requireAdmin } from '~/lib/auth.server';
import { t as tr, type AdminLang, type StringKey } from '~/lib/admin-i18n';

export async function loader({ request }: Route.LoaderArgs) {
  const { user, lang, headers } = await requireAdmin(request);
  return Response.json({ user, lang }, { headers });
}

const NAV: { to: string; end?: boolean; labelKey: StringKey; icon: string }[] = [
  { to: '/', end: true, labelKey: 'nav.dashboard', icon: '◧' },
  { to: '/bookings', labelKey: 'nav.bookings', icon: '✎' },
  { to: '/rooms', labelKey: 'nav.rooms', icon: '⌂' },
  { to: '/activity', labelKey: 'nav.activity', icon: '≣' },
  { to: '/system', labelKey: 'nav.system', icon: '⚙' },
];

export default function AdminLayout() {
  const { user, lang } = useLoaderData<{ user: { email: string | null }; lang: AdminLang }>();
  const { pathname } = useLocation();
  const title = pageTitle(pathname, lang);

  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
    } finally {
      window.location.href = '/login';
    }
  }

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
    }`;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary font-display text-base font-bold text-primary-foreground">木</span>
          <div className="leading-none">
            <div className="font-display text-sm font-semibold">Kimura</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr(lang, 'layout.admin')}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => linkCls(isActive)}>
              <span className="text-base">{n.icon}</span>{tr(lang, n.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <a href="https://kimura.ekalliptus.com" className="mb-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
            <span>↗</span> {tr(lang, 'layout.view_site')}
          </a>
          <div className="rounded-md bg-secondary/50 px-3 py-2">
            <div className="truncate text-xs text-muted-foreground">{user?.email ?? '—'}</div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card/60 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary md:hidden" aria-label={tr(lang, 'layout.open_menu')} aria-controls="admin-mobile-nav" aria-expanded={menuOpen}>
              <svg className="size-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h1 className="truncate font-display text-lg font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Form method="post" action="/api/admin/lang" className="contents">
              <button type="submit" className="rounded-md px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-secondary" aria-label="Toggle language">
                {lang === 'id' ? 'EN' : 'ID'}
              </button>
            </Form>
            <button type="button" onClick={toggleTheme} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary" aria-label={tr(lang, 'layout.toggle_theme')}>
              <svg className="size-4 dark:hidden" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
              <svg className="hidden size-4 dark:block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /><path strokeLinecap="round" d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
            </button>
            <button type="button" onClick={signOut} disabled={signingOut} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:opacity-50" aria-label={tr(lang, 'layout.sign_out')} title={tr(lang, 'layout.sign_out')}>
              <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" /></svg>
            </button>
          </div>
        </header>

        <nav id="admin-mobile-nav" className={`${menuOpen ? '' : 'hidden '}border-b border-border bg-card md:hidden`}>
          <div className="grid grid-cols-2 gap-1 p-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMenuOpen(false)} className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${active(isActive)}`
              }>
                <span>{n.icon}</span>{tr(lang, n.labelKey)}
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function active(isActive: boolean) {
  return isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60';
}

function pageTitle(pathname: string, lang: AdminLang): string {
  if (pathname.startsWith('/bookings')) return tr(lang, 'nav.bookings');
  if (pathname.startsWith('/rooms')) return tr(lang, 'nav.rooms');
  if (pathname.startsWith('/activity')) return tr(lang, 'nav.activity');
  if (pathname.startsWith('/system')) return tr(lang, 'nav.system');
  return tr(lang, 'nav.dashboard');
}
