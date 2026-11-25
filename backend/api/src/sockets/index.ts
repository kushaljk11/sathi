import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from '../config/database';
import { socketCorsOptions } from '../config/cors';
import { verifyAccessToken } from '../utils/jwt.util';
import { conversationAccess, sendMessage } from '../modules/chat/chat.service';

export let io: Server | null = null;

/** Socket.IO with JWT handshake auth; rooms are joined only after relationship authorization. */
export function attachRealtime(http: HttpServer) {
  io = new Server(http, { cors: socketCorsOptions, path: '/socket.io' });

  io.use(async (socket, next) => {
    try {
      const userId = verifyAccessToken(String(socket.handshake.auth?.token ?? ''));
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
      if (!u || u.status !== 'ACTIVE') return next(new Error('unauthorized'));
      socket.data.user = { id: u.id, role: u.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join', async (relationshipId: string, ack?: (r: unknown) => void) => {
      try {
        await conversationAccess(relationshipId, socket.data.user);
        await socket.join(`rel:${relationshipId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on('send', async (p: { relationshipId: string; body: string }, ack?: (r: unknown) => void) => {
      try {
        const m = await sendMessage(p.relationshipId, socket.data.user, p.body);
        io!.to(`rel:${p.relationshipId}`).emit('message', m);
        ack?.({ ok: true, message: m });
      } catch (e) {
        ack?.({ ok: false, error: e instanceof Error ? e.message : 'failed' });
      }
    });
  });
  return io;
}
