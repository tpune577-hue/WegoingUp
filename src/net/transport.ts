import type { NetMsg } from './protocol';

// Transport แบบสลับได้ ตาม ADR-0001 ข้อ 4 — ใช้ realtime channel ที่มีอยู่
// ไม่เขียน game server เอง
export interface Transport {
  join(room: string): Promise<void>;
  send(msg: NetMsg): void;
  onMessage(cb: (msg: NetMsg) => void): void;
  leave(): void;
}

// เล่นข้ามแท็บบนเครื่องเดียวกัน — สำหรับ dev/ทดสอบ ไม่ต้องตั้งค่าอะไร
export class BroadcastTransport implements Transport {
  private bc: BroadcastChannel | null = null;
  private cb: ((msg: NetMsg) => void) | null = null;

  async join(room: string): Promise<void> {
    this.bc = new BroadcastChannel(`wgw-${room}`);
    this.bc.onmessage = (e) => this.cb?.(e.data as NetMsg);
  }
  send(msg: NetMsg): void {
    this.bc?.postMessage(msg);
  }
  onMessage(cb: (msg: NetMsg) => void): void {
    this.cb = cb;
  }
  leave(): void {
    this.bc?.close();
    this.bc = null;
  }
}

// เล่นออนไลน์ข้ามเครื่องผ่าน Supabase Realtime broadcast
export class SupabaseTransport implements Transport {
  private channel: import('@supabase/supabase-js').RealtimeChannel | null = null;
  private cb: ((msg: NetMsg) => void) | null = null;

  async join(room: string): Promise<void> {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) {
      throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ใน .env');
    }
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, key);
    this.channel = client.channel(`wgw-${room}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on('broadcast', { event: 'm' }, (p) => {
      this.cb?.(p.payload as NetMsg);
    });
    await new Promise<void>((resolve, reject) => {
      this.channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`เชื่อมต่อ Supabase ไม่สำเร็จ (${status})`));
        }
      });
    });
  }
  send(msg: NetMsg): void {
    void this.channel?.send({ type: 'broadcast', event: 'm', payload: msg });
  }
  onMessage(cb: (msg: NetMsg) => void): void {
    this.cb = cb;
  }
  leave(): void {
    void this.channel?.unsubscribe();
    this.channel = null;
  }
}
