import { PauseIcon, PlayIcon } from '@primer/octicons-react';
import { IconButton } from '@primer/react';
import { MotionConfig } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

/**
 * Préférence d'animation. Primer interdit tout mouvement en boucle sans contrôle de l'utilisateur et
 * impose de respecter `prefers-reduced-motion` : les boucles (flux sur les liaisons, anneau des agents
 * au travail) se coupent ici, et la racine porte `data-motion="paused"` pour les animations CSS.
 */
interface MotionState {
  /** Vrai si les animations peuvent jouer : ni réduction demandée par le système, ni pause demandée ici. */
  enabled: boolean;
  reduced: boolean;
  paused: boolean;
  setPaused: (paused: boolean) => void;
}

/**
 * Un déplacement dans la page, une issue qui passe à la station suivante par exemple :
 * `--motion-duration-long` (500 ms, « large-scale layout shifts ») et `--motion-easing-move` de Primer.
 */
export const MOVE_TRANSITION = { duration: 0.5, ease: [0.6, 0, 0.2, 1] } as const;

const MotionContext = createContext<MotionState>({
  enabled: true,
  reduced: false,
  paused: false,
  setPaused: () => undefined,
});
const STORAGE_KEY = 'factory-live:motion';
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(listener: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

function readReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false;
}

function readPaused(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'paused';
  } catch {
    return false;
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);
  const [paused, setPausedState] = useState(readPaused);
  const setPaused = useCallback((value: boolean) => {
    setPausedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'paused' : 'on');
    } catch {
      // Stockage indisponible (navigation privée) : la préférence vaut pour la session.
    }
  }, []);
  const enabled = !reduced && !paused;
  useEffect(() => {
    document.documentElement.dataset['motion'] = enabled ? 'on' : 'paused';
  }, [enabled]);
  const value = useMemo(
    () => ({ enabled, reduced, paused, setPaused }),
    [enabled, reduced, paused, setPaused],
  );
  // Motion (bibliothèque) suit la même préférence : coupée, une boîte change de place sans glisser.
  return (
    <MotionContext.Provider value={value}>
      <MotionConfig reducedMotion={enabled ? 'never' : 'always'} transition={MOVE_TRANSITION}>
        {children}
      </MotionConfig>
    </MotionContext.Provider>
  );
}

export function useMotion(): MotionState {
  return useContext(MotionContext);
}

/** Bouton qui met en pause ou relance les animations en boucle (inactif si le système les réduit). */
export function MotionToggle() {
  const { paused, reduced, setPaused } = useMotion();
  if (reduced) {
    return (
      <IconButton
        icon={PauseIcon}
        aria-label="Animations réduites par le système"
        inactive
        size="small"
        variant="invisible"
      />
    );
  }
  return (
    <IconButton
      icon={paused ? PlayIcon : PauseIcon}
      aria-label={paused ? 'Relancer les animations' : 'Mettre les animations en pause'}
      aria-pressed={paused}
      size="small"
      variant="invisible"
      onClick={() => setPaused(!paused)}
    />
  );
}
