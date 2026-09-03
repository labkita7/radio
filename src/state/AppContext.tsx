import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

export interface AppState {
  selectedPlaceId: string | null;
  currentChannelId: string | null;
  isPlaying: boolean;
  volume: number;
}

export type Action =
  | { type: 'SELECT_PLACE'; placeId: string | null }
  | { type: 'PLAY_CHANNEL'; channelId: string }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'SET_PLAYING'; playing: boolean }
  | { type: 'SET_VOLUME'; volume: number };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SELECT_PLACE':
      return { ...state, selectedPlaceId: action.placeId };
    case 'PLAY_CHANNEL':
      return { ...state, currentChannelId: action.channelId, isPlaying: true };
    case 'TOGGLE_PLAY':
      return { ...state, isPlaying: !state.isPlaying };
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.playing };
    case 'SET_VOLUME':
      return { ...state, volume: action.volume };
  }
}

const savedVolume = Number(localStorage.getItem('rg:volume'));
interface AppContextValue extends AppState {
  dispatch: React.Dispatch<Action>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    selectedPlaceId: null,
    currentChannelId: null,
    isPlaying: false,
    volume: Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.8,
  });
  const value = useMemo(() => ({ ...state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/** Persist volume ke localStorage. Dipanggil dari PlayerBar. */
export function usePersistVolume(volume: number) {
  useEffect(() => {
    localStorage.setItem('rg:volume', String(volume));
  }, [volume]);
}
