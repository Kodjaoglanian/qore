import type { MessagingProvider } from "../types.js";

interface Subscription {
  id: string;
  topic: string;
  handler: (message: Buffer) => void;
}

export class LocalPubSub implements MessagingProvider {
  readonly type = "local" as const;
  private topics: Map<string, Buffer[]> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private subCounter = 0;

  async publish(topic: string, message: Buffer): Promise<void> {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, []);
    }
    this.topics.get(topic)!.push(message);

    for (const sub of this.subscriptions.values()) {
      if (sub.topic === topic) {
        try {
          sub.handler(message);
        } catch {
          // never crash the orchestrator on handler errors
        }
      }
    }
  }

  async subscribe(topic: string, handler: (message: Buffer) => void): Promise<string> {
    const id = `sub-${++this.subCounter}`;
    this.subscriptions.set(id, { id, topic, handler });
    return id;
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    this.subscriptions.delete(subscriptionId);
  }

  async listTopics(): Promise<string[]> {
    return Array.from(this.topics.keys());
  }
}
