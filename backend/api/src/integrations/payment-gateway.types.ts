/** Payment gateway abstraction shared by eSewa and Khalti. Server-side verification is the only source of truth. */
export interface InitiateResult {
  redirect: { method: 'GET' | 'POST'; url: string; fields?: Record<string, string> };
  providerRef?: string;
}

export interface VerifyResult {
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  transactionId?: string;
  amountPaisa?: number;
  raw: unknown;
}

/** NPR amount as the gateways expect it ("500" or "500.50"). */
export const rupees = (paisa: number) => (paisa / 100).toFixed(2).replace(/\.00$/, '');
