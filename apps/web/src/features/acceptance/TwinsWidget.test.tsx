import type { AcceptanceView, TwinsBenchState } from '@factory-live/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contactAcceptance } from '../../demo/acceptance.ts';
import { TwinsWidget } from './TwinsWidget.tsx';

const API = '/api/twins/factory-live/25';

/** A recette whose PR has a live pair on the bench (#23): its streams are the server's sessions. */
function liveView(): AcceptanceView {
  const view = contactAcceptance('judged', '2026-11-04T10:00:00.000Z');
  return {
    ...view,
    twins: {
      state: 'ready',
      divergence: null,
      surfaces: [
        {
          id: 'app',
          label: 'App',
          kind: 'web',
          changed: true,
          base: { sha: 'a'.repeat(40), stream: `${API}/session/base`, poster: null },
          head: { sha: 'b'.repeat(40), stream: `${API}/session/head`, poster: null },
          differences: null,
        },
      ],
    },
    twinsAbsent: null,
  };
}

/** A WebSocket that records what the PWA sends and lets the test speak for Neko. */
class FakeSocket {
  static all: FakeSocket[] = [];
  readonly url: string;
  readyState = 1;
  sent: { event: string; payload?: unknown }[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((message: MessageEvent) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as { event: string; payload?: unknown });
  }
  close() {
    this.readyState = 3;
  }
}

let bench: TwinsBenchState;
/** The bench refuses sessions (it restarts), as long as this says so. */
let sessionsDown = false;
let sessionAsks = 0;
let posts: { path: string; body: unknown }[];

const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  const path = url.slice(API.length);
  if (init?.method === 'POST') {
    posts.push({ path, body: JSON.parse(init.body as string) as unknown });
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (path.startsWith('/session/')) {
    sessionAsks += 1;
    if (sessionsDown) return Promise.resolve(new Response(null, { status: 502 }));
    return Promise.resolve(
      Response.json({
        ws: 'ws://localhost:52127/api/ws',
        token: 'tok',
        candidateHost: '127.0.0.1',
      }),
    );
  }
  return Promise.resolve(Response.json(bench));
});
const fetchImpl = fetchMock as unknown as typeof fetch;

/** The two live screens, each with its stream; jsdom has no video, so each gets the twin's size. */
async function liveScreens(): Promise<HTMLElement[]> {
  const screens = await screen.findAllByRole('application');
  await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  for (const each of screens) {
    const video = each.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 800 });
    video.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400 }) as DOMRect;
    act(() => {
      video.dispatchEvent(new Event('playing'));
    });
  }
  return screens;
}

beforeEach(() => {
  FakeSocket.all = [];
  posts = [];
  sessionsDown = false;
  sessionAsks = 0;
  bench = { mirror: true, divergence: null, lagMs: 0.12 };
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    run(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe('jumeaux vivants', () => {
  it("les deux flux d'une surface s'affichent sans iframe de l'app", async () => {
    const { container } = render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    const screens = await liveScreens();
    expect(screens).toHaveLength(2);
    expect(screens.map((each) => each.querySelectorAll('video').length)).toEqual([1, 1]);
    expect(container.querySelector('iframe')).toBeNull();
    // Desktop: side by side.
    expect(container.querySelector('[data-view]')?.getAttribute('data-view')).toBe('side');
    // Each joins its own twin's session, as a viewer, and asks Neko for its video.
    expect(FakeSocket.all.map((each) => each.url)).toEqual([
      'ws://localhost:52127/api/ws?token=tok',
      'ws://localhost:52127/api/ws?token=tok',
    ]);
    act(() => FakeSocket.all[0]?.onopen?.());
    expect(FakeSocket.all[0]?.sent[0]).toEqual({
      event: 'signal/request',
      payload: { video: {}, audio: { disabled: true } },
    });
    expect(
      await screen.findByText(/Décalage du miroir entre les deux jumeaux : 0,12 ms/),
    ).toBeTruthy();
  });

  it("un geste part vers le banc et n'est rejoué que si le miroir est actif", async () => {
    render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    const [, after] = await liveScreens();
    fireEvent.pointerDown(after!, { clientX: 39, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerUp(after!, { clientX: 39, clientY: 150, button: 0, pointerId: 1 });
    // In the twin's own pixels (the screen is drawn at half its size), to the head's twin, in order.
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts).toEqual([
      {
        path: '/gesture',
        body: { side: 'head', event: 'control/move', payload: { x: 78, y: 300 } },
      },
      {
        path: '/gesture',
        body: { side: 'head', event: 'control/buttondown', payload: { code: 1 } },
      },
      { path: '/gesture', body: { side: 'head', event: 'control/buttonup', payload: { code: 1 } } },
    ]);
    expect(screen.getByText('Tes gestes sur un jumeau sont rejoués sur l’autre.')).toBeTruthy();

    // The mirror off is the bench's: the switch asks it, and the screen follows what it says.
    await userEvent.click(screen.getByRole('button', { name: 'Miroir de tes gestes' }));
    expect(posts.at(-1)).toEqual({ path: '/mirror', body: { on: false } });
    bench = { ...bench, mirror: false };
    expect(
      await screen.findByText('Tu pilotes chaque jumeau séparément.', {}, { timeout: 3000 }),
    ).toBeTruthy();
  });

  it('la divergence propose de piloter séparément ou de resynchroniser', async () => {
    bench = {
      mirror: false,
      divergence: 'Les deux écrans diffèrent sous le pointeur (600, 200) : miroir suspendu.',
      lagMs: 0.12,
    };
    render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    expect(
      await screen.findByText(
        'Les deux écrans diffèrent sous le pointeur (600, 200) : miroir suspendu.',
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Piloter séparément' }));
    expect(posts.at(-1)).toEqual({ path: '/mirror', body: { on: false } });
    const [resync] = screen.getAllByRole('button', { name: 'Resynchroniser' });
    await userEvent.click(resync!);
    expect(posts.at(-1)).toEqual({ path: '/resync', body: {} });
  });

  it('un flux perdu le dit et garde la dernière image', async () => {
    render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    const [before] = await liveScreens();
    expect(before!.querySelector('img')).toBeNull();
    act(() => FakeSocket.all[0]?.onclose?.());
    expect(await screen.findByText(/Flux perdu : dernière image du jumeau/)).toBeTruthy();
    // jsdom draws no frame: the last image is the twin's screen as the bench keeps it.
    expect(before!.querySelector('img')?.getAttribute('src')).toBe(`${API}/shot/base`);
  });

  it('un bouton tenu est relâché quand l’écran perd le focus', async () => {
    render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    const [, after] = await liveScreens();
    fireEvent.pointerDown(after!, { clientX: 39, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.blur(after!);
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts.at(-1)).toEqual({
      path: '/gesture',
      body: { side: 'head', event: 'control/buttonup', payload: { code: 1 } },
    });
  });

  it('un flux qui retombe pendant un nouvel essai est réessayé encore', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
      await waitFor(() => expect(FakeSocket.all).toHaveLength(2));
      // The bench restarts: the stream drops, and its sessions fail for a while.
      sessionsDown = true;
      act(() => FakeSocket.all[0]?.onclose?.());
      const asked = sessionAsks;
      await act(() => vi.advanceTimersByTimeAsync(5000));
      await waitFor(() => expect(sessionAsks).toBe(asked + 1));
      await act(() => vi.advanceTimersByTimeAsync(5000));
      await waitFor(() => expect(sessionAsks).toBe(asked + 2));
      // Back up: the next attempt joins the twin again.
      sessionsDown = false;
      await act(() => vi.advanceTimersByTimeAsync(5000));
      await waitFor(() => expect(FakeSocket.all).toHaveLength(3));
    } finally {
      vi.useRealTimers();
    }
  });

  it('une touche lâchée après Maj est relâchée telle qu’elle a été appuyée', async () => {
    render(<TwinsWidget view={liveView()} fetchImpl={fetchImpl} />);
    const [, after] = await liveScreens();
    fireEvent.keyDown(after!, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.keyDown(after!, { key: 'A', code: 'KeyA' });
    fireEvent.keyUp(after!, { key: 'Shift', code: 'ShiftLeft' });
    fireEvent.keyUp(after!, { key: 'a', code: 'KeyA' });
    await waitFor(() => expect(posts).toHaveLength(4));
    expect(posts.map((each) => each.body)).toEqual([
      { side: 'head', event: 'control/keydown', payload: { keysym: 0xffe1 } },
      { side: 'head', event: 'control/keydown', payload: { keysym: 0x41 } },
      { side: 'head', event: 'control/keyup', payload: { keysym: 0xffe1 } },
      { side: 'head', event: 'control/keyup', payload: { keysym: 0x41 } },
    ]);
  });
});
