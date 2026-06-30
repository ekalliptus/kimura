import { type RouteConfig, index, route, layout } from '@react-router/dev/routes';

export default [
  route('login', 'routes/login.tsx'),

  // JSON resource routes — same paths the reused React components fetch().
  route('api/admin/auth', 'routes/api.auth.tsx'),
  route('api/admin/lang', 'routes/api.lang.tsx'),
  route('api/admin/logs', 'routes/api.logs.tsx'),
  route('api/admin/bookings', 'routes/api.bookings.tsx'),
  route('api/admin/rooms', 'routes/api.rooms.tsx'),
  route('api/admin/images', 'routes/api.images.tsx'),
  route('api/admin/keepalive', 'routes/api.keepalive.tsx'),

  // Authed app shell (loader guards via requireAdmin).
  layout('routes/admin-layout.tsx', [
    index('routes/dashboard.tsx'),
    route('bookings', 'routes/bookings.tsx'),
    route('rooms', 'routes/rooms.tsx'),
    route('activity', 'routes/activity.tsx'),
    route('system', 'routes/system.tsx'),
  ]),
] satisfies RouteConfig;
