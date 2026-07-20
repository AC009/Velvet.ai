export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PhantomPushPacket {
  title: string;
  body: string;
  url: string;
  tag?: string;
}
