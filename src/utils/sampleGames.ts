export interface SampleGame {
  id: string;
  white: string;
  black: string;
  whiteRating: number;
  blackRating: number;
  status: 'white_won' | 'black_won' | 'draw';
  reason: string;
  timeControl: string;
  timestamp: string;
  pgn: string;
  description: string;
}

export const SAMPLE_SHOWCASE_GAMES: SampleGame[] = [
  {
    id: "showcase-opera-game",
    white: "Paul Morphy",
    black: "Duke of Brunswick & Count Isouard",
    whiteRating: 2600,
    blackRating: 2100,
    status: "white_won",
    reason: "Checkmate",
    timeControl: "classical",
    timestamp: "1858-11-02T12:00:00.000Z",
    description: "The Opera Game — One of the most famous tactical masterpieces in chess history, played at the Paris Opera House.",
    pgn: `[Event "Paris Opera"]
[Site "Paris, France"]
[Date "1858.11.02"]
[Round "?"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`
  },
  {
    id: "showcase-immortal-game",
    white: "Adolf Anderssen",
    black: "Lionel Kieseritzky",
    whiteRating: 2550,
    blackRating: 2450,
    status: "white_won",
    reason: "Checkmate",
    timeControl: "classical",
    timestamp: "1851-06-21T12:00:00.000Z",
    description: "The Immortal Game — Anderssen gives up both rooks and his queen to deliver a breathtaking checkmate.",
    pgn: `[Event "London Informal Match"]
[Site "London, England"]
[Date "1851.06.21"]
[Round "?"]
[White "Adolf Anderssen"]
[Black "Lionel Kieseritzky"]
[Result "1-0"]

1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0`
  },
  {
    id: "showcase-deep-blue",
    white: "Deep Blue",
    black: "Garry Kasparov",
    whiteRating: 2800,
    blackRating: 2815,
    status: "white_won",
    reason: "Resignation",
    timeControl: "classical",
    timestamp: "1996-02-10T15:00:00.000Z",
    description: "Deep Blue vs Kasparov (Game 1, 1996) — The historic first game where a computer defeated a reigning World Champion.",
    pgn: `[Event "ACM Challenge Match"]
[Site "Philadelphia, PA USA"]
[Date "1996.02.10"]
[Round "1"]
[White "Deep Blue"]
[Black "Garry Kasparov"]
[Result "1-0"]

1. e4 c5 2. c3 d5 3. exd5 Qxd5 4. d4 Nf6 5. Nf3 Bg4 6. Be2 e6 7. h3 Bh5 8. O-O Nc6 9. Be3 cxd4 10. cxd4 Bb4 11. a3 Ba5 12. Nc3 Qd6 13. Nb5 Qe7 14. Ne5 Bxe2 15. Qxe2 O-O 16. Rac1 Rac8 17. Bg5 Bb6 18. Bxf6 gxf6 19. Nc4 Rfd8 20. Nxb6 axb6 21. Rfd1 f5 22. Qe3 Qf6 23. d5 Rxd5 24. Rxd5 exd5 25. b3 Kh8 26. Qxb6 Rg8 27. Qc5 d4 28. Nd6 f4 29. Nxb7 Ne5 30. Qd5 f3 31. g3 Nd3 32. Rc7 Re8 33. Nd6 Re1+ 34. Kh2 Nxf2 35. Nxf7+ Kg7 36. Ng5+ Kh6 37. Rxh7+ 1-0`
  }
];

// Helper to save completed games into localStorage match history
export function saveLocalMatchHistory(game: {
  id: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  status: string;
  reason?: string;
  timeControl?: string;
  pgn: string;
  timestamp?: number | string;
}) {
  try {
    const existingStr = localStorage.getItem('chessarena_match_history');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    
    // Avoid duplicate IDs
    const filtered = existing.filter((g: any) => g.id !== game.id);
    const updated = [
      {
        ...game,
        timestamp: game.timestamp || Date.now()
      },
      ...filtered
    ].slice(0, 50); // Store up to 50 recent games
    
    localStorage.setItem('chessarena_match_history', JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save match history to localStorage', err);
  }
}

export function getLocalMatchHistory(): any[] {
  try {
    const existingStr = localStorage.getItem('chessarena_match_history');
    return existingStr ? JSON.parse(existingStr) : [];
  } catch (err) {
    console.error('Failed to get match history from localStorage', err);
    return [];
  }
}
