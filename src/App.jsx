import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Peer from "peerjs";
import { Bot, Check, ChevronRight, Clock3, Copy, Crown, Gem, HelpCircle, LockKeyhole, LogOut, Play, RotateCcw, Share2, Sparkles, Users, X } from "lucide-react";
import {
  ALL_TOKENS,
  COLORS,
  COLOR_META,
  applyAction,
  createGame,
  emptyTokens,
  paymentFor,
  playerBonuses,
  playerScore,
  tokenTotal,
} from "./game.js";
import { BOT_LEVELS, chooseBotAction, playTimedTurn } from "./bot.js";

const AVATARS = {
  chiikawa: { label: "치이카와", image: "/assets/cards/chiikawa.png", color: "#ffe2e9" },
  hachiware: { label: "하치와레", image: "/assets/cards/hachiware.png", color: "#d9efff" },
  usagi: { label: "우사기", image: "/assets/cards/usagi.png", color: "#fff0b8" },
  kurimanju: { label: "쿠리만쥬", image: "/assets/cards/kurimanju.png", color: "#f1ddc8" },
  ode: { label: "오데", image: "/assets/cards/ode.png", color: "#dcebd8" },
  momonga: { label: "모몽가", image: "/assets/cards/momonga.png", color: "#eee2ff" },
};
const LEGACY_AVATARS = { ruby: "chiikawa", sapphire: "hachiware", emerald: "usagi", diamond: "momonga" };

const makeId = () => crypto.randomUUID();
const makeRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

function useMultiplayer() {
  const [mode, setMode] = useState("landing");
  const [roomCode, setRoomCode] = useState("");
  const [lobby, setLobby] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const peerRef = useRef(null);
  const hostConnectionRef = useRef(null);
  const guestConnectionsRef = useRef(new Map());
  const profileRef = useRef(null);
  const isHostRef = useRef(false);
  const lobbyRef = useRef(null);
  const gameRef = useRef(null);

  const setLobbyState = useCallback((next) => {
    lobbyRef.current = next;
    setLobby(next);
  }, []);
  const setGameState = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  const broadcast = useCallback((payload) => {
    guestConnectionsRef.current.forEach(({ connection }) => {
      if (connection.open) connection.send(payload);
    });
  }, []);

  const publishLobby = useCallback((next) => {
    setLobbyState(next);
    broadcast({ type: "lobby", lobby: next });
  }, [broadcast, setLobbyState]);

  const publishGame = useCallback((next) => {
    setGameState(next);
    broadcast({ type: "game", game: next });
  }, [broadcast, setGameState]);

  const runAction = useCallback((playerId, action, connection = null) => {
    try {
      const next = applyAction(gameRef.current, playerId, action);
      publishGame(next);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "행동을 처리하지 못했어요.";
      if (connection?.open) connection.send({ type: "error", message });
      else setError(message);
    }
  }, [publishGame]);

  const attachGuestConnection = useCallback((connection) => {
    connection.on("data", (message) => {
      if (!message || typeof message !== "object") return;
      if (message.type === "join") {
        const currentLobby = lobbyRef.current;
        if (!currentLobby || currentLobby.status !== "waiting") {
          connection.send({ type: "error", message: "이미 게임이 시작된 방이에요." });
          return;
        }
        const existing = currentLobby.players.find((player) => player.id === message.profile.id);
        if (!existing && currentLobby.players.length >= 4) {
          connection.send({ type: "error", message: "방이 가득 찼어요." });
          return;
        }
        const players = existing
          ? currentLobby.players.map((player) => player.id === message.profile.id ? { ...message.profile, connected: true } : player)
          : [...currentLobby.players, { ...message.profile, connected: true }];
        guestConnectionsRef.current.set(message.profile.id, { connection, playerId: message.profile.id });
        publishLobby({ ...currentLobby, players });
      }
      if (message.type === "action") {
        const record = [...guestConnectionsRef.current.values()].find((entry) => entry.connection === connection);
        if (record) runAction(record.playerId, message.action, connection);
      }
    });
    connection.on("close", () => {
      const record = [...guestConnectionsRef.current.values()].find((entry) => entry.connection === connection);
      if (!record) return;
      guestConnectionsRef.current.delete(record.playerId);
      if (lobbyRef.current?.status === "waiting") {
        publishLobby({ ...lobbyRef.current, players: lobbyRef.current.players.filter((player) => player.id !== record.playerId) });
      }
    });
  }, [publishLobby, runAction]);

  const cleanup = useCallback(() => {
    peerRef.current?.destroy();
    peerRef.current = null;
    hostConnectionRef.current = null;
    guestConnectionsRef.current.clear();
    isHostRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    if (!isHostRef.current || game?.status !== "playing" || !game.turnDeadline) return undefined;
    const deadline = game.turnDeadline;
    const timer = setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.status !== "playing" || current.turnDeadline !== deadline) return;
      const timedOutPlayer = current.players[current.turn];
      try { publishGame(playTimedTurn(current, timedOutPlayer.id)); }
      catch { /* 다음 동기화에서 다시 시도할 수 있도록 게임 상태를 유지해요. */ }
    }, Math.max(0, deadline - Date.now()) + 30);
    return () => clearTimeout(timer);
  }, [game?.status, game?.turnDeadline, publishGame]);

  const hostRoom = useCallback((profile) => {
    cleanup();
    const code = makeRoomCode();
    const peer = new Peer(`gemfriends-${code.toLowerCase()}`);
    peerRef.current = peer;
    profileRef.current = profile;
    isHostRef.current = true;
    setConnectionState("connecting");
    peer.on("open", () => {
      const nextLobby = { roomCode: code, status: "waiting", hostId: profile.id, players: [{ ...profile, connected: true }] };
      setRoomCode(code);
      setLobbyState(nextLobby);
      setMode("lobby");
      setConnectionState("connected");
      history.replaceState(null, "", `?room=${code}`);
    });
    peer.on("connection", attachGuestConnection);
    peer.on("error", (peerError) => {
      setError(peerError.type === "unavailable-id" ? "방 코드가 겹쳤어요. 다시 만들어주세요." : "방을 열지 못했어요. 잠시 후 다시 시도해주세요.");
      setConnectionState("error");
    });
  }, [attachGuestConnection, cleanup, setLobbyState]);

  const joinRoom = useCallback((profile, rawCode) => {
    cleanup();
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 5) { setError("5자리 방 코드를 확인해주세요."); return; }
    const peer = new Peer();
    peerRef.current = peer;
    profileRef.current = profile;
    isHostRef.current = false;
    setConnectionState("connecting");
    peer.on("open", () => {
      const connection = peer.connect(`gemfriends-${code.toLowerCase()}`, { reliable: true });
      hostConnectionRef.current = connection;
      const timeout = setTimeout(() => {
        if (!connection.open) { setError("방을 찾지 못했어요. 코드와 방장 접속 상태를 확인해주세요."); setConnectionState("error"); }
      }, 8000);
      connection.on("open", () => {
        clearTimeout(timeout);
        connection.send({ type: "join", profile });
        setRoomCode(code);
        setMode("lobby");
        setConnectionState("connected");
        history.replaceState(null, "", `?room=${code}`);
      });
      connection.on("data", (message) => {
        if (message.type === "lobby") setLobbyState(message.lobby);
        if (message.type === "game") { setGameState(message.game); setMode("game"); }
        if (message.type === "error") setError(message.message);
      });
      connection.on("close", () => { setError("방장과 연결이 끊겼어요."); setConnectionState("error"); });
    });
    peer.on("error", () => { setError("친구 방에 연결하지 못했어요."); setConnectionState("error"); });
  }, [cleanup, setGameState, setLobbyState]);

  const startGame = useCallback(() => {
    if (!isHostRef.current || lobbyRef.current.players.length < 2) return;
    const nextLobby = { ...lobbyRef.current, status: "playing" };
    publishLobby(nextLobby);
    const nextGame = createGame(nextLobby.players, nextLobby.roomCode);
    publishGame(nextGame);
    setMode("game");
  }, [publishGame, publishLobby]);

  const sendAction = useCallback((action) => {
    const playerId = profileRef.current?.id;
    if (!playerId) return;
    if (isHostRef.current) runAction(playerId, action);
    else if (hostConnectionRef.current?.open) hostConnectionRef.current.send({ type: "action", action });
  }, [runAction]);

  const leave = useCallback(() => {
    cleanup();
    setMode("landing");
    setLobbyState(null);
    setGameState(null);
    setRoomCode("");
    setError("");
    setConnectionState("idle");
    history.replaceState(null, "", location.pathname);
  }, [cleanup, setGameState, setLobbyState]);

  return {
    mode, roomCode, lobby, game, error, setError, connectionState,
    me: profileRef.current, isHost: isHostRef.current,
    hostRoom, joinRoom, startGame, sendAction, leave,
  };
}

function Avatar({ avatar, size = "md" }) {
  const item = AVATARS[LEGACY_AVATARS[avatar] || avatar] || AVATARS.chiikawa;
  return <span className={`avatar avatar-${size}`} style={{ "--avatar-bg": item.color }} aria-label={item.label}><img src={item.image} alt="" /></span>;
}

function Landing({ onHost, onJoin, onSolo, connecting }) {
  const initialRoom = new URLSearchParams(location.search).get("room")?.toUpperCase() || "";
  const [name, setName] = useState(localStorage.getItem("gemfriends-name") || "");
  const savedAvatar = localStorage.getItem("gemfriends-avatar");
  const [avatar, setAvatar] = useState(AVATARS[savedAvatar] ? savedAvatar : (LEGACY_AVATARS[savedAvatar] || "chiikawa"));
  const [room, setRoom] = useState(initialRoom);
  const [difficulty, setDifficulty] = useState(localStorage.getItem("gemfriends-bot-level") || "intermediate");

  const profile = () => {
    const cleanName = name.trim().slice(0, 10);
    if (!cleanName) return null;
    localStorage.setItem("gemfriends-name", cleanName);
    localStorage.setItem("gemfriends-avatar", avatar);
    const savedId = localStorage.getItem("gemfriends-id") || makeId();
    localStorage.setItem("gemfriends-id", savedId);
    return { id: savedId, name: cleanName, avatar };
  };

  return (
    <main className="landing">
      <nav className="landing-nav">
        <a className="brand" href="#top"><span className="brand-gem">◆</span><span>보석친구</span></a>
        <button className="text-button" onClick={() => document.getElementById("rules")?.showModal()}><HelpCircle size={18} /> 규칙 보기</button>
      </nav>
      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> 혼자 또는 2–4인 온라인 보드게임</div>
          <h1>반짝이는 보석,<br /><em>친구와 한 판!</em></h1>
          <p>방 코드 하나로 모여 보석을 모으고, 카드를 사고, 귀족의 마음을 사로잡아 보세요.</p>
          <div className="profile-card glass-card">
            <label>플레이어 이름<input value={name} onChange={(event) => setName(event.target.value)} placeholder="이름을 적어주세요" maxLength={10} /></label>
            <fieldset>
            <legend>내 보석 마스코트 고르기</legend>
              <div className="avatar-options">
                {Object.entries(AVATARS).map(([key, item]) => (
                  <button key={key} type="button" className={avatar === key ? "selected" : ""} onClick={() => setAvatar(key)} aria-label={item.label} style={{ "--avatar-bg": item.color }}>
                    <span><img src={item.image} alt="" /></span>{avatar === key && <Check size={14} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="bot-level-fieldset">
              <legend><Bot size={15} /> 혼자 플레이 · 봇 난이도</legend>
              <div className="bot-levels">
                {Object.entries(BOT_LEVELS).map(([key, level]) => (
                  <button key={key} type="button" className={difficulty === key ? "selected" : ""} onClick={() => { setDifficulty(key); localStorage.setItem("gemfriends-bot-level", key); }}>
                    <strong>{level.label}</strong><span>{"★".repeat(level.stars)}</span><small>{level.subtitle}</small>
                  </button>
                ))}
              </div>
              <button className="solo-button" onClick={() => { const p = profile(); if (p) onSolo(p, difficulty); }}><Bot size={19} /> {BOT_LEVELS[difficulty].label} 봇과 시작</button>
            </fieldset>
            <div className="mode-divider"><span>친구와 플레이</span></div>
            <div className="room-actions">
              <button className="primary-button" disabled={connecting === "connecting"} onClick={() => { const p = profile(); if (p) onHost(p); }}><Play size={19} fill="currentColor" /> 새 방 만들기</button>
              <div className="join-row">
                <input aria-label="방 코드" value={room} onChange={(event) => setRoom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder="방 코드 5자리" />
                <button disabled={connecting === "connecting"} onClick={() => { const p = profile(); if (p) onJoin(p, room); }}>입장 <ChevronRight size={18} /></button>
              </div>
            </div>
          </div>
          <p className="fan-note">비상업 팬메이드 게임 · 친구끼리 가볍게 즐겨요</p>
        </div>
        <div className="hero-art" role="img" aria-label="치이카와 친구들이 보석 게임을 즐기는 팬아트" />
      </section>
      <section className="feature-strip">
        <div><Bot /><strong>1인 봇 대전</strong><span>4단계 난이도 선택</span></div>
        <div><Share2 /><strong>방 코드</strong><span>설치 없이 바로 초대</span></div>
        <div><LockKeyhole /><strong>방장 진행</strong><span>턴과 규칙 자동 판정</span></div>
      </section>
      <RulesDialog />
    </main>
  );
}

function RulesDialog() {
  return (
    <dialog id="rules" className="rules-dialog">
      <button className="close-button" onClick={() => document.getElementById("rules")?.close()} aria-label="닫기"><X /></button>
      <div className="eyebrow"><Gem size={15} /> 클래식 스플렌더 규칙</div>
      <h2>15점을 향해 보석 엔진을 만들어요</h2>
      <div className="rules-grid">
        <section><b>내 차례의 액션 1개</b><p>서로 다른 보석 3개, 같은 보석 2개(공급처에 4개 이상), 카드 1장 구매, 또는 카드 1장 예약 중 하나를 해요.</p></section>
        <section><b>카드와 할인</b><p>구매한 카드의 보너스는 이후 같은 색 비용을 영구 할인해요. 골드는 부족한 어떤 색이든 대신 내는 조커예요.</p></section>
        <section><b>예약과 한도</b><p>예약 카드는 최대 3장. 가능하면 골드 1개도 받아요. 턴 종료 시 토큰은 골드를 포함해 10개까지만 보유해요.</p></section>
        <section><b>귀족과 승리</b><p>카드 보너스 조건을 채우면 귀족이 자동 방문해 3점. 15점 도달 시 마지막 순서까지 진행한 뒤 최고 점수가 승리해요.</p></section>
      </div>
      <div className="setup-table"><span>2인 · 색당 4개 · 귀족 3장</span><span>3인 · 색당 5개 · 귀족 4장</span><span>4인 · 색당 7개 · 귀족 5장</span></div>
    </dialog>
  );
}

function Lobby({ lobby, me, isHost, onStart, onLeave }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${location.origin}${location.pathname}?room=${lobby?.roomCode || ""}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`보석친구 같이 하자! 방 코드 ${lobby.roomCode}\n${shareUrl}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <main className="lobby-page">
      <div className="lobby-card">
        <div className="floating-gem gem-a">◆</div><div className="floating-gem gem-b">◆</div>
        <div className="eyebrow"><Users size={15} /> 친구를 기다리는 중</div>
        <h1>보석 파티 준비 완료!</h1>
        <p>친구에게 아래 코드를 알려주세요.</p>
        <button className="room-code" onClick={copyInvite}><span>{lobby?.roomCode || "·····"}</span>{copied ? <Check /> : <Copy />}</button>
        <div className="players-grid">
          {Array.from({ length: 4 }, (_, index) => {
            const player = lobby?.players[index];
            return player ? (
              <div className="lobby-player" key={player.id}><Avatar avatar={player.avatar} size="lg" /><strong>{player.name}</strong>{player.id === lobby.hostId && <span>방장</span>}{player.id === me?.id && <small>나</small>}</div>
            ) : <div className="lobby-player empty" key={index}><span className="empty-avatar">+</span><strong>빈 자리</strong><small>친구를 초대해요</small></div>;
          })}
        </div>
        {isHost ? <button className="primary-button start-button" disabled={!lobby || lobby.players.length < 2} onClick={onStart}><Play size={20} fill="currentColor" /> {lobby?.players.length < 2 ? "친구 한 명만 더!" : `${lobby.players.length}명으로 시작하기`}</button> : <div className="waiting-pill"><span /> 방장이 곧 시작해요</div>}
        <button className="text-button leave-button" onClick={onLeave}><LogOut size={17} /> 방 나가기</button>
      </div>
    </main>
  );
}

function Token({ color, count, selected = 0, onClick, compact = false }) {
  const meta = COLOR_META[color];
  return (
    <button className={`token token-${color} ${selected ? "token-selected" : ""} ${compact ? "token-compact" : ""}`} onClick={onClick} disabled={!onClick} style={{ "--token-color": meta.hex }} aria-label={`${meta.label} ${count}개`} title={meta.label}>
      <span className={`token-gem shape-${meta.shape}`}><span className="token-glint" /></span>
      <span className="token-count">{count}</span>{selected > 0 && <b className="selected-count">+{selected}</b>}
    </button>
  );
}

function MiniGem({ color, count }) {
  const meta = COLOR_META[color];
  return <span className={`mini-gem mini-${color} mini-shape-${meta.shape}`} title={meta.label}>{count !== undefined && <b>{count}</b>}</span>;
}

function DevelopmentCard({ card, canAct, onBuy, onReserve, source }) {
  const affordable = canAct && Boolean(onBuy);
  const artVariant = (card.artVariant ?? 0) % 12;
  const artIndex = card.artVariant ?? 0;
  const artStyle = {
    "--art-x": `${18 + ((artIndex * 17) % 68)}%`,
    "--art-y": `${30 + ((artIndex * 11) % 45)}%`,
    "--art-scale": `${1.02 + ((artIndex * 7) % 18) / 100}`,
    "--art-rotate": `${(artIndex % 7) - 3}deg`,
    "--art-hue": `${(artIndex * 13) % 32}deg`,
  };
  return (
    <article className={`dev-card bonus-${card.bonus}`} style={{ "--bonus-color": COLOR_META[card.bonus].hex }}>
      <div className="card-top"><strong>{card.points || ""}</strong><span className={`card-bonus mini-shape-${COLOR_META[card.bonus].shape}`} title={`${COLOR_META[card.bonus].label} 영구 할인`}>{COLOR_META[card.bonus].short}</span></div>
      <div className={`card-art card-art-${card.artType} card-art-v-${artVariant}`} style={artStyle}><img src={`/assets/cards/${card.art}`} alt="먼작귀 팬아트 카드" loading="lazy" /></div>
      <div className="cost-list">
        {COLORS.filter((color) => card.cost[color] > 0).map((color) => <MiniGem key={color} color={color} count={card.cost[color]} />)}
      </div>
      {canAct && <div className="card-actions">
        <button disabled={!affordable} onClick={onBuy}>{affordable ? "구매" : "부족"}</button>
        {source !== "reserved" && <button className="reserve-button" onClick={onReserve}>예약</button>}
      </div>}
    </article>
  );
}

function NobleCard({ noble, selectable, onClick }) {
  return (
    <button className={`noble-card ${selectable ? "selectable" : ""}`} onClick={onClick} disabled={!selectable}><Crown size={21} /><strong>3</strong><div>{Object.entries(noble.cost).map(([color, count]) => <MiniGem key={color} color={color} count={count} />)}</div></button>
  );
}

function PlayerPanel({ player, active, me, canAct, onBuyReserved }) {
  const bonuses = playerBonuses(player);
  const ownedTokens = ALL_TOKENS.filter((color) => player.tokens[color] > 0);
  const ownedBonuses = COLORS.filter((color) => bonuses[color] > 0);
  return (
    <section className={`player-panel ${active ? "active" : ""} ${me ? "me" : ""}`}>
      <div className="player-head"><Avatar avatar={player.avatar} /><div><strong>{player.name}{me ? " · 나" : ""}{player.isBot && <em>{BOT_LEVELS[player.difficulty]?.label || "BOT"}</em>}</strong><span className="score-line"><b>{playerScore(player)}점</b> · 카드 {player.cards.length}장 · 귀족 {player.nobles.length}</span></div>{active && <i>차례</i>}</div>
      <div className="bonus-row">{COLORS.map((color) => <span key={color} className={`bonus-chip bonus-${color} mini-shape-${COLOR_META[color].shape}`}><i>{COLOR_META[color].short}</i><b>{bonuses[color]}</b><small>+{player.tokens[color]}</small></span>)}<span className="bonus-chip bonus-gold mini-shape-star"><i>골</i><b>{player.tokens.gold}</b></span></div>
      <div className="player-meta"><span>토큰 {tokenTotal(player)}/10</span><span>예약 {player.reserved.length}/3</span><span>귀족 {player.nobles.length}</span></div>
      <details className="player-details" open={me}>
        <summary>{me ? "내 보유 상태" : "상대 보유 상태"}</summary>
        <div className="inventory-row"><span>보석</span><div className="inventory-items">{ownedTokens.length ? ownedTokens.map((color) => <MiniGem key={color} color={color} count={player.tokens[color]} />) : <small>없음</small>}</div></div>
        <div className="inventory-row"><span>개발</span><div className="inventory-items">{ownedBonuses.length ? ownedBonuses.map((color) => <span className={`card-owned-chip bonus-${color}`} key={color}><i>{COLOR_META[color].short}</i><b>{bonuses[color]}장</b></span>) : <small>없음</small>}</div></div>
        <div className="inventory-row"><span>예약</span><b>{player.reserved.length}장</b></div>
      </details>
      {me && player.reserved.length > 0 && <details className="reserved-list"><summary>내 예약 카드 보기</summary><div>{player.reserved.map((card) => <DevelopmentCard key={card.id} card={card} source="reserved" canAct={canAct} onBuy={paymentFor(player, card) ? () => onBuyReserved(card) : null} />)}</div></details>}
    </section>
  );
}

function GameBoard({ game, me, roomCode, onAction, onLeave }) {
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [notice, setNotice] = useState("");
  const [mobilePanel, setMobilePanel] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000)));
  const player = game.players.find((item) => item.id === me?.id);
  const isMyTurn = game.status === "playing" && game.players[game.turn]?.id === me?.id;
  const canMainAction = isMyTurn && !game.pending;

  useEffect(() => { setSelectedTokens([]); }, [game.turn, game.round]);
  useEffect(() => {
    const update = () => setTimeLeft(Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [game.turnDeadline]);
  const selectToken = (color) => {
    if (!canMainAction || game.supply[color] < 1) return;
    setSelectedTokens((current) => {
      if (current.length === 2 && current[0] === color && current[1] === color) return [];
      if (current.length === 1 && current[0] === color && game.supply[color] >= 4) return [color, color];
      if (current.includes(color)) return current.filter((item) => item !== color);
      if (current.length === 0) return [color];
      if (new Set(current).size === current.length && !current.includes(color) && current.length < 3) return [...current, color];
      return [color];
    });
  };
  const validSelection = selectedTokens.length === 3 && new Set(selectedTokens).size === 3 || selectedTokens.length === 2 && new Set(selectedTokens).size === 1;
  const act = (action) => { setNotice(""); onAction(action); };
  const buy = (card, source) => act({ type: "buy", source, cardId: card.id });
  const reserve = (card, tier) => act({ type: "reserve", source: String(tier), cardId: card.id });

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand"><span className="brand-gem">◆</span><span>보석친구</span></div>
        <div className="turn-banner"><Avatar avatar={game.players[game.turn]?.avatar} size="sm" /><span>{game.status === "finished" ? "게임이 끝났어요" : isMyTurn ? "내 차례예요!" : `${game.players[game.turn]?.name}님의 차례`}</span><small>ROUND {game.round}</small><b className={timeLeft <= 10 ? "urgent" : ""}><Clock3 /> {game.status === "finished" ? "--" : timeLeft}</b></div>
        <div className="header-actions"><button onClick={() => document.getElementById("rules")?.showModal()}><HelpCircle /></button><button onClick={onLeave}><LogOut /></button></div>
      </header>
      <div className="game-layout">
        <div className="board-area">
          <div className="board-top-row">
            <section className="supply-section panel-card">
              <div className="section-title"><div><span>공급처</span><small>{canMainAction ? "보석을 눌러 골라주세요" : "공용 보석"}</small></div>{selectedTokens.length > 0 && <button className="clear-pick" onClick={() => setSelectedTokens([])}>선택 취소</button>}</div>
              <div className="token-row">{ALL_TOKENS.map((color) => <Token key={color} color={color} count={game.supply[color]} selected={selectedTokens.filter((item) => item === color).length} onClick={color !== "gold" && canMainAction ? () => selectToken(color) : null} />)}</div>
              {selectedTokens.length > 0 && <button className="take-confirm" disabled={!validSelection} onClick={() => act({ type: "take", colors: selectedTokens })}><Gem size={18} /> {validSelection ? `${selectedTokens.length}개 가져가기` : "서로 다른 3개 또는 같은 2개"}</button>}
            </section>

            <section className="nobles-section panel-card"><div className="section-title"><div><span>귀족 광장</span><small>조건을 채우면 3점</small></div></div><div className="nobles-row">{game.nobles.map((noble) => <NobleCard key={noble.id} noble={noble} />)}</div></section>
          </div>

          <section className="player-overview panel-card">
            <div className="section-title"><div><span>플레이어 현황</span><small>점수·카드·예약·보유 보석</small></div></div>
            <div className="score-strip">{game.players.map((item) => <span key={item.id} className={item.id === me?.id ? "is-me" : ""}><Avatar avatar={item.avatar} size="sm" /><div className="score-player"><b>{item.name}</b><small>카드 {item.cards.length}장 · 예약 {item.reserved.length}</small></div><strong>{playerScore(item)}점</strong><div className="score-assets">{ALL_TOKENS.filter((color) => item.tokens[color] > 0).map((color) => <MiniGem key={color} color={color} count={item.tokens[color]} />)}</div></span>)}</div>
          </section>

          <section className="market panel-card">
            {[3, 2, 1].map((tier) => <div className="market-row" key={tier}>
              <button className={`deck deck-${tier}`} disabled={!canMainAction || player?.reserved.length >= 3 || !game.decks[tier].length} onClick={() => act({ type: "reserve", source: String(tier) })}><span>{tier}</span><b>{game.decks[tier].length}</b><small>비공개 예약</small></button>
              <div className="cards-row">{game.board[tier].map((card) => <DevelopmentCard key={card.id} card={card} source={String(tier)} canAct={canMainAction} onBuy={paymentFor(player, card) ? () => buy(card, String(tier)) : null} onReserve={player?.reserved.length < 3 ? () => reserve(card, tier) : null} />)}</div>
            </div>)}
          </section>
        </div>

        <aside className={`side-panel ${mobilePanel ? "open" : ""}`}>
          <button className="mobile-panel-toggle" onClick={() => setMobilePanel((value) => !value)}><Users size={18} /> 플레이어 {mobilePanel ? <X /> : <ChevronRight />}</button>
          <div className="room-mini"><span>ROOM</span><b>{roomCode}</b></div>
          <div className="players-stack">{game.players.map((item, index) => <PlayerPanel key={item.id} player={item} active={index === game.turn && game.status !== "finished"} me={item.id === me?.id} canAct={canMainAction} onBuyReserved={(card) => buy(card, "reserved")} />)}</div>
        </aside>
      </div>
      {notice && <div className="toast">{notice}</div>}
      {game.pending?.type === "discard" && game.pending.playerId === me?.id && <DiscardModal player={player} count={game.pending.count} onConfirm={(tokens) => act({ type: "discard", tokens })} />}
      {game.pending?.type === "noble" && game.pending.playerId === me?.id && <NobleModal nobles={game.nobles.filter((noble) => game.pending.nobleIds.includes(noble.id))} onChoose={(nobleId) => act({ type: "noble", nobleId })} />}
      {game.status === "finished" && <WinnerModal game={game} me={me} onLeave={onLeave} />}
      <RulesDialog />
    </main>
  );
}

function DiscardModal({ player, count, onConfirm }) {
  const [returns, setReturns] = useState(emptyTokens());
  const selected = Object.values(returns).reduce((sum, value) => sum + value, 0);
  const change = (color, amount) => setReturns((current) => ({ ...current, [color]: Math.max(0, Math.min(player.tokens[color], current[color] + amount)) }));
  return <div className="modal-backdrop"><div className="choice-modal"><div className="eyebrow"><RotateCcw size={15} /> 토큰 한도</div><h2>{count}개를 공급처에 돌려주세요</h2><p>턴이 끝날 때 골드를 포함해 최대 10개까지 보유할 수 있어요.</p><div className="discard-grid">{ALL_TOKENS.filter((color) => player.tokens[color] > 0).map((color) => <div key={color}><Token color={color} count={player.tokens[color]} compact /><button onClick={() => change(color, -1)}>−</button><b>{returns[color]}</b><button onClick={() => change(color, 1)}>+</button></div>)}</div><button className="primary-button" disabled={selected !== count} onClick={() => onConfirm(returns)}>{selected}/{count}개 반납하기</button></div></div>;
}

function NobleModal({ nobles, onChoose }) {
  return <div className="modal-backdrop"><div className="choice-modal"><div className="eyebrow"><Crown size={15} /> 귀족 방문</div><h2>맞이할 귀족을 골라주세요</h2><p>한 턴에는 귀족 한 명만 방문할 수 있어요.</p><div className="noble-choice">{nobles.map((noble) => <NobleCard key={noble.id} noble={noble} selectable onClick={() => onChoose(noble.id)} />)}</div></div></div>;
}

function WinnerModal({ game, me, onLeave }) {
  const winners = game.players.filter((player) => game.winnerIds.includes(player.id));
  const won = game.winnerIds.includes(me?.id);
  return <div className="modal-backdrop celebration"><div className="winner-modal"><div className="winner-crown">👑</div><span>{won ? "내가 해냈어요!" : "멋진 승부였어요!"}</span><h1>{winners.map((player) => player.name).join(", ")} 승리</h1><p>동점일 때는 구매한 개발 카드가 더 적은 플레이어가 승리해요.</p><div className="scoreboard">{[...game.players].sort((a, b) => playerScore(b) - playerScore(a)).map((player, index) => <div key={player.id}><b>{index + 1}</b><Avatar avatar={player.avatar} /><span>{player.name}</span><strong>{playerScore(player)}점</strong><small>카드 {player.cards.length}장</small></div>)}</div><button className="primary-button" onClick={onLeave}>랜딩으로 돌아가기</button></div></div>;
}

function DemoGame() {
  const demoPlayers = useMemo(() => [
    { id: "demo-me", name: "준희", avatar: "chiikawa" },
    { id: "demo-friend", name: "보석친구", avatar: "hachiware" },
  ], []);
  const [demoGame, setDemoGame] = useState(() => createGame(demoPlayers, "DEMO1"));
  const demoMe = demoPlayers[0];
  const onAction = (action) => {
    try { setDemoGame((current) => applyAction(current, demoMe.id, action)); }
    catch { /* QA용 데모에서는 잘못된 동작을 그대로 무시해요. */ }
  };
  return <GameBoard game={demoGame} me={demoMe} roomCode="DEMO1" onAction={onAction} onLeave={() => { location.href = location.pathname; }} />;
}

function SoloGame({ profile, difficulty, onLeave }) {
  const bot = useMemo(() => ({ id: `bot-${difficulty}`, name: "보석콩 BOT", avatar: "momonga", isBot: true, difficulty }), [difficulty]);
  const [game, setGame] = useState(() => createGame([profile, bot], `SOLO-${difficulty.toUpperCase()}`));
  const [error, setError] = useState("");

  useEffect(() => {
    const current = game.players[game.turn];
    const isBotTurn = game.status === "playing" && (current?.id === bot.id || game.pending?.playerId === bot.id);
    if (!isBotTurn) return undefined;
    const timer = setTimeout(() => {
      try {
        const action = chooseBotAction(game, bot.id, difficulty);
        if (action) setGame((currentGame) => applyAction(currentGame, bot.id, action));
      } catch (botError) {
        setError(botError instanceof Error ? botError.message : "봇이 잠시 고민에 빠졌어요.");
      }
    }, difficulty === "legendary" ? 850 : 620);
    return () => clearTimeout(timer);
  }, [bot.id, difficulty, game]);

  useEffect(() => {
    if (game.status !== "playing" || !game.turnDeadline) return undefined;
    const deadline = game.turnDeadline;
    const timer = setTimeout(() => {
      setGame((current) => {
        if (current.status !== "playing" || current.turnDeadline !== deadline) return current;
        return playTimedTurn(current, current.players[current.turn].id);
      });
    }, Math.max(0, deadline - Date.now()) + 30);
    return () => clearTimeout(timer);
  }, [game.status, game.turnDeadline]);

  const onAction = (action) => {
    try { setError(""); setGame((current) => applyAction(current, profile.id, action)); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "행동을 처리하지 못했어요."); }
  };
  return <><GameBoard game={game} me={profile} roomCode={`SOLO · ${BOT_LEVELS[difficulty].label}`} onAction={onAction} onLeave={onLeave} />{error && <div className="global-error"><span>{error}</span><button onClick={() => setError("")}><X size={18} /></button></div>}</>;
}

export default function App() {
  const isDemo = new URLSearchParams(location.search).get("demo") === "1";
  const [soloConfig, setSoloConfig] = useState(null);
  const multiplayer = useMultiplayer();
  if (isDemo) return <DemoGame />;
  if (soloConfig) return <SoloGame profile={soloConfig.profile} difficulty={soloConfig.difficulty} onLeave={() => setSoloConfig(null)} />;
  return (
    <>
      {multiplayer.mode === "landing" && <Landing onHost={multiplayer.hostRoom} onJoin={multiplayer.joinRoom} onSolo={(profile, difficulty) => setSoloConfig({ profile, difficulty })} connecting={multiplayer.connectionState} />}
      {multiplayer.mode === "lobby" && <Lobby lobby={multiplayer.lobby} me={multiplayer.me} isHost={multiplayer.isHost} onStart={multiplayer.startGame} onLeave={multiplayer.leave} />}
      {multiplayer.mode === "game" && multiplayer.game && <GameBoard game={multiplayer.game} me={multiplayer.me} roomCode={multiplayer.roomCode} onAction={multiplayer.sendAction} onLeave={multiplayer.leave} />}
      {multiplayer.error && <div className="global-error"><span>{multiplayer.error}</span><button onClick={() => multiplayer.setError("")}><X size={18} /></button></div>}
    </>
  );
}
