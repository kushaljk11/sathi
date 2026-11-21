import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Flag, Ban } from 'lucide-react';
import { getAccessToken } from '../lib/api';
import { useApi, useAction, post } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Button, ErrorState, LoadingBlock, Notice, fmtTime, fmtDate, useConfirm, cx } from './ui';

interface Msg { id: string; senderId: string; body: string; createdAt: string; readAt: string | null }
interface Thread { conversationId: string; blocked: boolean; open: boolean; messages: Msg[] }

/** Private, relationship-scoped chat. Real-time via Socket.IO; REST fallback for history and sending. */
export default function Chat({ relationshipId }: { relationshipId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const key = ['chat', relationshipId];
  const q = useApi<Thread>(key, `/chat/${relationshipId}/messages`);
  const [text, setText] = useState('');
  const sock = useRef<Socket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = io({ path: '/socket.io', auth: { token: getAccessToken() }, transports: ['websocket'] });
    s.on('connect', () => s.emit('join', relationshipId));
    s.on('message', (m: Msg) => qc.setQueryData<Thread>(key, (t) => (t && !t.messages.some((x) => x.id === m.id) ? { ...t, messages: [...t.messages, m] } : t)));
    sock.current = s;
    return () => { s.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationshipId]);
  useEffect(() => bottom.current?.scrollIntoView({ block: 'nearest' }), [q.data?.messages.length]);

  const send = useAction(async (body: string) => {
    const m = await post<Msg>(`/chat/${relationshipId}/messages`, { body });
    qc.setQueryData<Thread>(key, (t) => (t && !t.messages.some((x) => x.id === m.id) ? { ...t, messages: [...t.messages, m] } : t));
  }, { onSuccess: () => setText('') });
  const block = useAction(() => post(`/chat/${relationshipId}/${q.data?.blocked ? 'unblock' : 'block'}`), { invalidate: [key], success: 'Updated' });
  const report = useAction((id: string) => post(`/chat/messages/${id}/report`, { reason: 'Reported from chat' }), { success: 'Message reported to moderators' });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorState message="Could not load messages" onRetry={() => q.refetch()} />;
  const canSend = q.data.open && !q.data.blocked;
  return (
    <div className="flex h-[480px] flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>Private conversation · visible only to you and your {user?.role === 'YOUTH' ? 'counselor' : 'client'}</span>
        <Button size="sm" variant="ghost" onClick={async () => (q.data!.blocked || (await confirm({ title: 'Block messages?', message: 'Neither of you will be able to send messages until unblocked.', danger: true }))) && block.mutate()}>
          <Ban className="size-3.5" />{q.data.blocked ? 'Unblock' : 'Block'}
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {!q.data.messages.length && <p className="py-8 text-center text-sm text-slate-400">No messages yet.</p>}
        {q.data.messages.map((m, i) => {
          const mine = m.senderId === user?.id;
          const newDay = i === 0 || fmtDate(q.data!.messages[i - 1].createdAt) !== fmtDate(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-[11px] text-slate-400">{fmtDate(m.createdAt)}</p>}
              <div className={cx('group flex items-end gap-1', mine ? 'justify-end' : 'justify-start')}>
                {!mine && <button onClick={() => report.mutate(m.id)} className="invisible rounded p-1 text-slate-300 group-hover:visible hover:text-rose-500" aria-label="Report message"><Flag className="size-3" /></button>}
                <div className={cx('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap', mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-slate-100 text-slate-800')}>
                  {m.body}<span className={cx('mt-0.5 block text-right text-[10px]', mine ? 'text-brand-100' : 'text-slate-400')}>{fmtTime(m.createdAt)}{mine && m.readAt ? ' · Read' : ''}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {canSend ? (
        <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}>
          <label htmlFor={`chat-${relationshipId}`} className="sr-only">Message</label>
          <input id={`chat-${relationshipId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="Write a message…" className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <Button type="submit" loading={send.isPending} aria-label="Send"><Send className="size-4" /></Button>
        </form>
      ) : (
        <div className="p-3"><Notice tone="amber">{q.data.blocked ? 'Messaging is blocked for this conversation.' : 'This support relationship has ended, so new messages are closed. History is kept per the retention policy.'}</Notice></div>
      )}
    </div>
  );
}
