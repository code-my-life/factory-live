import { TwinSession, type TwinGesture, TwinsBenchState } from '@factory-live/contracts';

/**
 * A twin watched as a Neko client (#23, ADR 0013): the PWA joins the twin's WebSocket with a viewer's
 * token the server obtained, answers Neko's WebRTC offer and shows the stream. It never drives the
 * session: the bench's mirror holds control, and the owner's gestures go to it through the server.
 */

export type StreamStatus = 'connecting' | 'live' | 'lost';

interface NekoMessage {
  event: string;
  payload?: unknown;
}

/** An ICE candidate naming `host` instead of the address Neko announced (this PC: the tailnet does not answer it). */
export function candidateAt(
  candidate: RTCIceCandidateInit,
  host: string | null,
): RTCIceCandidateInit {
  if (!host || !candidate.candidate) return candidate;
  const parts = candidate.candidate.split(' ');
  // candidate:<foundation> <component> <transport> <priority> <address> <port> typ …
  if (parts.length > 5) parts[4] = host;
  return { ...candidate, candidate: parts.join(' ') };
}

/**
 * Joins one twin's stream into `video`. `onStatus` hears it connect, play and drop. Returns the way to
 * leave: the WebSocket and the peer connection closed.
 */
export function watchTwin(
  session: TwinSession,
  video: HTMLVideoElement,
  onStatus: (status: StreamStatus) => void,
  make: {
    socket?: (url: string) => WebSocket;
    peer?: (config: RTCConfiguration) => RTCPeerConnection;
  } = {},
): () => void {
  const socket = (make.socket ?? ((url) => new WebSocket(url)))(
    `${session.ws}?token=${encodeURIComponent(session.token)}`,
  );
  let peer: RTCPeerConnection | null = null;
  let left = false;
  // Neko may send its candidates before its offer: they wait for it.
  const early: RTCIceCandidateInit[] = [];
  const send = (event: string, payload?: unknown) => {
    if (socket.readyState === 1) socket.send(JSON.stringify({ event, payload }));
  };
  const lost = () => {
    if (!left) onStatus('lost');
  };

  onStatus('connecting');
  socket.onopen = () => send('signal/request', { video: {}, audio: { disabled: true } });
  socket.onclose = lost;
  socket.onerror = lost;
  socket.onmessage = async (message: MessageEvent) => {
    let data: NekoMessage;
    try {
      data = JSON.parse(String(message.data)) as NekoMessage;
    } catch {
      return;
    }
    if (data.event === 'system/heartbeat') {
      send('client/heartbeat');
    } else if (data.event === 'signal/candidate') {
      const candidate = candidateAt(data.payload as RTCIceCandidateInit, session.candidateHost);
      if (peer?.remoteDescription) await peer.addIceCandidate(candidate).catch(() => undefined);
      else early.push(candidate);
    } else if (data.event === 'signal/provide') {
      const offer = data.payload as { sdp: string; iceservers?: RTCIceServer[] };
      peer?.close();
      peer = (make.peer ?? ((config) => new RTCPeerConnection(config)))({
        iceServers: offer.iceservers ?? [],
      });
      peer.ontrack = (event) => {
        video.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void video.play?.().catch(() => undefined);
      };
      peer.onicecandidate = (event) => {
        if (event.candidate) send('signal/candidate', event.candidate.toJSON());
      };
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === 'failed' || peer?.connectionState === 'disconnected') lost();
      };
      await peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
      for (const candidate of early.splice(0))
        await peer.addIceCandidate(candidate).catch(() => undefined);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send('signal/answer', { sdp: answer.sdp });
    } else if (data.event === 'signal/close') {
      lost();
    }
  };
  const playing = () => onStatus('live');
  video.addEventListener('playing', playing);

  return () => {
    left = true;
    video.removeEventListener('playing', playing);
    peer?.close();
    socket.close();
  };
}

/** The twin's pixel under a pointer on its video, the screen drawn whole inside the element (`object-fit: contain`). */
export function pointOn(
  video: { videoWidth: number; videoHeight: number; getBoundingClientRect(): DOMRect },
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const box = video.getBoundingClientRect();
  if (!video.videoWidth || !video.videoHeight || !box.width || !box.height) return null;
  const scale = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
  const left = box.left + (box.width - video.videoWidth * scale) / 2;
  const top = box.top + (box.height - video.videoHeight * scale) / 2;
  const x = Math.round((clientX - left) / scale);
  const y = Math.round((clientY - top) / scale);
  return x >= 0 && y >= 0 && x < video.videoWidth && y < video.videoHeight ? { x, y } : null;
}

/** X11 keysyms of the keys that are not a character (Neko's `control/keydown`). */
const KEYSYMS: Record<string, number> = {
  Backspace: 0xff08,
  Tab: 0xff09,
  Enter: 0xff0d,
  Escape: 0xff1b,
  Delete: 0xffff,
  Home: 0xff50,
  ArrowLeft: 0xff51,
  ArrowUp: 0xff52,
  ArrowRight: 0xff53,
  ArrowDown: 0xff54,
  PageUp: 0xff55,
  PageDown: 0xff56,
  End: 0xff57,
  Shift: 0xffe1,
  Control: 0xffe3,
  Alt: 0xffe9,
  Meta: 0xffeb,
};

/** The keysym of a key: a character is its code point (Latin-1 as is, the rest as Unicode keysyms). */
export function keysymOf(key: string): number | null {
  if (KEYSYMS[key]) return KEYSYMS[key];
  const chars = [...key];
  if (chars.length !== 1) return null;
  const code = chars[0]!.codePointAt(0)!;
  return code < 0x100 ? code : 0x1000000 + code;
}

/** The server's side of the bench for one PR: its session, its last images, the mirror. */
export class TwinsApi {
  /** `/api/twins/<repo>/<pr>`. */
  readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(base: string, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    this.base = base;
    this.fetchImpl = fetchImpl;
  }

  /** The bench's address for one PR, read in the session address the recette gives. */
  static of(stream: string | null, fetchImpl?: typeof fetch): TwinsApi | null {
    const base =
      stream && /^(\/api\/twins\/[\w-]+\/\d+)\/session\/(?:base|head)$/.exec(stream)?.[1];
    return base ? new TwinsApi(base, fetchImpl) : null;
  }

  shot(side: 'base' | 'head'): string {
    return `${this.base}/shot/${side}`;
  }

  async session(side: 'base' | 'head'): Promise<TwinSession> {
    const response = await this.fetchImpl(`${this.base}/session/${side}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`session: HTTP ${response.status}`);
    return TwinSession.parse(await response.json());
  }

  async state(): Promise<TwinsBenchState | null> {
    const response = await this.fetchImpl(`${this.base}/state`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const state = TwinsBenchState.safeParse(await response.json());
    return state.success ? state.data : null;
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.fetchImpl(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Factory-Live': '1' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  }

  /** What waits to reach the bench, in order: gestures and the mirror's commands share one line. */
  private readonly pending: {
    path: '/gesture' | '/mirror' | '/resync';
    body: unknown;
    settle?: (response: Response | null) => void;
  }[] = [];
  private sending = false;

  /**
   * A gesture, in order: a press must never reach the bench before the move that leads to it, nor a
   * release before its press. While one is on its way, a move waiting behind it takes the place of the
   * move before it: only the pointer's latest place matters.
   */
  gesture(gesture: TwinGesture): void {
    const last = this.pending.at(-1)?.body as TwinGesture | undefined;
    if (
      gesture.event === 'control/move' &&
      this.pending.at(-1)?.path === '/gesture' &&
      last?.event === 'control/move' &&
      last.side === gesture.side
    )
      this.pending[this.pending.length - 1] = { path: '/gesture', body: gesture };
    else this.pending.push({ path: '/gesture', body: gesture });
    void this.flush();
  }

  /** A command of the mirror, after the gestures already sent: it never overtakes them. */
  private command(path: '/mirror' | '/resync', body: unknown): Promise<Response | null> {
    // Back home, the gestures still waiting would only take the twins away from it again; but a
    // release still goes, its press may already be there.
    if (path === '/resync')
      for (let index = this.pending.length - 1; index >= 0; index -= 1) {
        const waiting = this.pending[index]!;
        const release =
          (waiting.body as TwinGesture | undefined)?.event === 'control/buttonup' ||
          (waiting.body as TwinGesture | undefined)?.event === 'control/keyup';
        if (waiting.path === '/gesture' && !release) this.pending.splice(index, 1);
      }
    return new Promise((settle) => {
      this.pending.push({ path, body, settle });
      void this.flush();
    });
  }

  private async flush(): Promise<void> {
    if (this.sending) return;
    this.sending = true;
    try {
      for (let next = this.pending.shift(); next; next = this.pending.shift()) {
        const response = await this.post(next.path, next.body).catch(() => null);
        next.settle?.(response);
      }
    } finally {
      this.sending = false;
    }
  }

  mirror(on: boolean): Promise<Response | null> {
    return this.command('/mirror', { on });
  }

  resync(): Promise<Response | null> {
    return this.command('/resync', {});
  }
}
