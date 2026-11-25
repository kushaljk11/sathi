import { createHmac } from 'node:crypto';
import { env } from '../../config/env';
import { rupees, type InitiateResult, type VerifyResult } from '../payment-gateway.types';

// ---------------- eSewa ePay v2 ----------------
export const esewaSign = (message: string, secret = env.ESEWA_SECRET_KEY ?? '') => createHmac('sha256', secret).update(message).digest('base64');

export const esewa = {
  statusUrl: () => (env.ESEWA_BASE_URL.includes('rc-epay') ? 'https://rc.esewa.com.np' : 'https://epay.esewa.com.np') + '/api/epay/transaction/status/',

  initiate(reference: string, amountPaisa: number): InitiateResult {
    const total = rupees(amountPaisa);
    const fields: Record<string, string> = {
      amount: total,
      tax_amount: '0',
      total_amount: total,
      transaction_uuid: reference,
      product_code: env.ESEWA_MERCHANT_CODE,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: `${env.BACKEND_URL}/api/v1/payments/esewa/return/${reference}`,
      failure_url: `${env.BACKEND_URL}/api/v1/payments/esewa/failed/${reference}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
    };
    fields.signature = esewaSign(`total_amount=${total},transaction_uuid=${reference},product_code=${env.ESEWA_MERCHANT_CODE}`);
    return { redirect: { method: 'POST', url: `${env.ESEWA_BASE_URL}/api/epay/main/v2/form`, fields } };
  },

  /** Verifies the base64 callback payload signature (tamper check only — the status API is still consulted). */
  verifyCallbackSignature(dataB64: string): Record<string, string> | null {
    try {
      const d = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8')) as Record<string, string>;
      const msg = d.signed_field_names
        .split(',')
        .map((f) => `${f}=${d[f]}`)
        .join(',');
      return esewaSign(msg) === d.signature ? d : null;
    } catch {
      return null;
    }
  },

  async verify(reference: string, amountPaisa: number): Promise<VerifyResult> {
    const url = `${esewa.statusUrl()}?product_code=${encodeURIComponent(env.ESEWA_MERCHANT_CODE)}&total_amount=${rupees(amountPaisa)}&transaction_uuid=${encodeURIComponent(reference)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const raw = (await res.json().catch(() => ({}))) as { status?: string; ref_id?: string; total_amount?: number };
    const status = raw.status === 'COMPLETE' ? 'SUCCESS' : raw.status === 'PENDING' || raw.status === 'AMBIGUOUS' ? 'PENDING' : 'FAILED';
    return { status, transactionId: raw.ref_id ?? undefined, amountPaisa: raw.total_amount != null ? Math.round(Number(raw.total_amount) * 100) : undefined, raw };
  },
};
