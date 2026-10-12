import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { migrate, openDatabase } from './db.js';
import { createApp } from './app.js';
import { createDueNotifications } from './reminders.js';

// npm exposes the active lifecycle script on every platform. This keeps the
// start command production-safe without relying on Unix-only VAR=value syntax.
if (!process.env.NODE_ENV && process.env.npm_lifecycle_event === 'start') {
  process.env.NODE_ENV = 'production';
}

const db = await openDatabase();
await db.query('SELECT 1');
await migrate(db);
const app = createApp(db);
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../frontend/dist');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(webDist));
  app.use((_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

setInterval(() => void createDueNotifications(db).catch(console.error), 60_000).unref();
const server = app.listen(port, () => console.log(`Gomata Vision CRM running on http://localhost:${port}`));

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing server`);
  server.close(() => void db.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
