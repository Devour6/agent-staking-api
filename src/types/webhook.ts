// Webhook-related types
export interface WebhookEvent {
  stake_confirmed: {
    transactionSignature: string;
    amount: number;
    validatorVoteAccount: string;
    agentWallet: string;
    stakeAccount: string;
    timestamp: string;
  };
  stake_activated: {
    transactionSignature: string;
    amount: number;
    validatorVoteAccount: string;
    agentWallet: string;
    stakeAccount: string;
    timestamp: string;
  };
  unstake_completed: {
    transactionSignature: string;
    amount: number;
    validatorVoteAccount: string;
    agentWallet: string;
    stakeAccount: string;
    timestamp: string;
  };
  reward_earned: {
    amount: number;
    validatorVoteAccount: string;
    agentWallet: string;
    stakeAccount: string;
    epoch: number;
    timestamp: string;
  };
  validator_delinquent: {
    validatorVoteAccount: string;
    agentWallet: string;
    stakeAccount: string;
    epochsDelinquent: number;
    timestamp: string;
  };
}

export type WebhookEventType = keyof WebhookEvent;

export interface WebhookRegistration {
  id: string;
  apiKey: string;
  url: string;
  events: WebhookEventType[];
  secret: string; // For HMAC signature verification
  active: boolean;
  createdAt: string;
  lastDeliveryAt?: string;
  failureCount: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEventType;
  payload: WebhookEvent[WebhookEventType];
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'max_retries_reached';
  responseStatus?: number;
  responseBody?: string;
  deliveredAt?: string;
  createdAt: string;
  nextRetryAt?: string;
}

export interface WebhookPayload<T extends WebhookEventType = WebhookEventType> {
  event: T;
  data: WebhookEvent[T];
  webhook: {
    id: string;
    timestamp: string;
  };
}

export interface RegisterWebhookRequest {
  url: string;
  events: WebhookEventType[];
  secret?: string; // Optional, will generate if not provided
}

export interface RegisterWebhookResponse {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  createdAt: string;
}

export interface ListWebhooksResponse {
  webhooks: Array<{
    id: string;
    url: string;
    events: WebhookEventType[];
    active: boolean;
    createdAt: string;
    lastDeliveryAt?: string;
    failureCount: number;
  }>;
}

export interface BuildAndMonitorRequest {
  agentWallet: string;
  amount: number;
  validatorVoteAccount?: string;
  webhookUrl?: string;
  webhookEvents?: WebhookEventType[];
}

export interface BuildAndMonitorResponse {
  transaction: string;
  stakeAccount: string;
  feeAmount: number;
  webhook?: {
    id: string;
    url: string;
    events: WebhookEventType[];
  };
}