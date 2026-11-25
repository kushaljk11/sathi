import { env } from '../../config/env';
import type { InitiateResult, VerifyResult } from '../payment-gateway.types';

// ---------------- Khalti ePayment v2 ----------------
const headers = () => ({ Authorization: `Key ${env.KHALTI_SECRET_KEY}`, 'Content-Type': 'application/json' });

export const khalti = {
  async initiate(reference: string, amountPaisa: number, name: string): Promise<InitiateResult> {
    const res = await fetch(`${env.KHALTI_BASE_URL}/epayment/initiate/`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: headers(),
      body: JSON.stringify({
        return_url: `${env.BACKEND_URL}/api/v1/payments/khalti/return/${reference}`,
        website_url: env.FRONTEND_URL,
        amount: amountPaisa,
        purchase_order_id: reference,
        purchase_order_name: name,
      }),
    });
    const raw = (await res.json().catch(() => ({}))) as { pidx?: string; payment_url?: string };
    if (!res.ok || !raw.pidx || !raw.payment_url) throw new Error('Khalti initiation failed');
    return { redirect: { method: 'GET', url: raw.payment_url }, providerRef: raw.pidx };
  },

  async verify(pidx: string): Promise<VerifyResult> {
    const res = await fetch(`${env.KHALTI_BASE_URL}/epayment/lookup/`, { method: 'POST', signal: AbortSignal.timeout(15000), headers: headers(), body: JSON.stringify({ pidx }) });
    const raw = (await res.json().catch(() => ({}))) as { status?: string; transaction_id?: string; total_amount?: number };
    const status = raw.status === 'Completed' ? 'SUCCESS' : raw.status === 'Pending' || raw.status === 'Initiated' ? 'PENDING' : 'FAILED';
    return { status, transactionId: raw.transaction_id ?? undefined, amountPaisa: raw.total_amount, raw };
  },
};
