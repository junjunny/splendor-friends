import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Peer from "peerjs";
import { BookOpenCheck, Bot, Check, ChevronRight, Clock3, Copy, Crown, Gem, HelpCircle, LockKeyhole, LogOut, Play, RotateCcw, Share2, Sparkles, Users, X } from "lucide-react";
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
import TutorialDialog from "./Tutorial.jsx";

const AVATARS = {
  chiikawa: { label: "치이카와", image: "/assets/cards/chiikawa.png", color: "#ffe2e9" },
  hachiware: { label: "하치와레", image: "/assets/cards/hachiware.png", color: "#d9efff" },
  usagi: { label: "우사기", image: "/assets/cards/usagi.png", color: "#fff0b8" },
  kurimanju: { label: "쿠리만쥬", image: "/assets/cards/kurimanju.png", color: "#f1ddc8" },
  ode: { label: "오데", image: "/assets/cards/ode.png", color: "#fff3a8" },
  momonga: { label: "모몽가", image: "/assets/cards/momonga.png", color: "#eee2ff" },
};
const LEGACY_AVATARS = { ruby: "chiikawa", sapphire: "hachiware", emerald: "usagi", diamond: "momonga" };

const makeId = () => crypto.randomUUID();
const makeRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const SESSION_KEY = "gemfriends-session";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const loadSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    return session && Date.now() - session.savedAt < SESSION_TTL_MS ? session : null;
  } catch { return null; }
};
const peerIdFor = (code) => `gemfriends-${code.toLowerCase()}`;

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
  const retryRef = useRef(null);

  const setLobbyState = useCallback((next) => {
    lobbyRef.current = next;
    setLobby(next);
  }, []);
  const setGameState = useCallback((next) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  // 모바일에서 카톡으로 코드를 보내러 나갔다 오면 브라우저가 연결을 끊거나 탭을 새로 고쳐요.
  // 방 상태를 저장해 두고 돌아왔을 때 같은 방 코드로 다시 열어요.
  useEffect(() => {
    if (!roomCode || !profileRef.current) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ isHost: isHostRef.current, roomCode, profile: profileRef.current, lobby, game, savedAt: Date.now() }));
  }, [roomCode, lobby, game]);

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
        const profile = message.profile;
        if (!currentLobby || !profile?.id) return;
        if (currentLobby.status !== "waiting") {
          // 게임 중 끊겼던 플레이어는 같은 자리로 다시 들어와요.
          if (gameRef.current?.players.some((player) => player.id === profile.id)) {
            guestConnectionsRef.current.set(profile.id, { connection, playerId: profile.id });
            connection.send({ type: "lobby", lobby: currentLobby });
            connection.send({ type: "game", game: gameRef.current });
          } else connection.send({ type: "error", message: "이미 게임이 시작된 방이에요." });
          return;
        }
        const existing = currentLobby.players.find((player) => player.id === profile.id);
        if (!existing && currentLobby.players.length >= 4) {
          connection.send({ type: "error", message: "방이 가득 찼어요." });
          return;
        }
        const players = existing
          ? currentLobby.players.map((player) => player.id === profile.id ? { ...profile, connected: true } : player)
          : [...currentLobby.players, { ...profile, connected: true }];
        guestConnectionsRef.current.set(profile.id, { connection, playerId: profile.id });
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
    clearTimeout(retryRef.current);
    peerRef.current?.destroy();
    peerRef.current = null;
    hostConnectionRef.current = null;
    guestConnectionsRef.current.clear();
    isHostRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // 시그널링 서버와의 연결만 끊긴 경우(백그라운드 전환 등) 같은 ID로 다시 붙어요.
  const reconnectSoon = useCallback((peer) => {
    setTimeout(() => { if (peerRef.current === peer && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 1000);
  }, []);
  useEffect(() => {
    const onVisible = () => {
      const peer = peerRef.current;
      if (document.visibilityState === "visible" && peer && !peer.destroyed && peer.disconnected) peer.reconnect();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  const hostRoom = useCallback((profile, resume = null) => {
    cleanup();
    const code = resume?.roomCode || makeRoomCode();
    profileRef.current = profile;
    isHostRef.current = true;
    if (resume) {
      setRoomCode(code);
      setLobbyState(resume.lobby);
      setGameState(resume.game);
      setMode(resume.game ? "game" : "lobby");
    }
    setConnectionState(resume ? "reconnecting" : "connecting");
    let attempts = 0;
    const open = () => {
      const peer = new Peer(peerIdFor(code));
      peerRef.current = peer;
      peer.on("open", () => {
        if (!lobbyRef.current) {
          setRoomCode(code);
          setLobbyState({ roomCode: code, status: "waiting", hostId: profile.id, players: [{ ...profile, connected: true }] });
          setMode("lobby");
        }
        attempts = 0;
        setConnectionState("connected");
        history.replaceState(null, "", `?room=${code}`);
      });
      peer.on("connection", attachGuestConnection);
      peer.on("disconnected", () => reconnectSoon(peer));
      peer.on("error", (peerError) => {
        if (peerRef.current !== peer) return;
        if (lobbyRef.current && (attempts += 1) <= 20) {
          // 이미 열린 방은 닫지 않고, 서버에 예전 ID가 남아 있으면 잠시 뒤 다시 열어요.
          setConnectionState("reconnecting");
          if (peer.destroyed) retryRef.current = setTimeout(open, 2000);
          return;
        }
        setError(peerError.type === "unavailable-id" && !lobbyRef.current ? "방 코드가 겹쳤어요. 다시 만들어주세요." : "방을 열지 못했어요. 잠시 후 다시 시도해주세요.");
        setConnectionState("error");
      });
    };
    open();
  }, [attachGuestConnection, cleanup, reconnectSoon, setGameState, setLobbyState]);

  const joinRoom = useCallback((profile, rawCode, resume = null) => {
    cleanup();
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 5) { setError("5자리 방 코드를 확인해주세요."); return; }
    const peer = new Peer();
    peerRef.current = peer;
    profileRef.current = profile;
    isHostRef.current = false;
    let joined = Boolean(resume);
    let attempts = 0;
    if (resume) {
      setRoomCode(code);
      setLobbyState(resume.lobby);
      setGameState(resume.game);
      setMode(resume.game ? "game" : "lobby");
    }
    setConnectionState(resume ? "reconnecting" : "connecting");
    const retry = () => {
      if (peerRef.current !== peer) return;
      attempts += 1;
      // 처음 입장은 금방 포기하고, 한 번 들어온 방은 방장이 돌아올 때까지 2분쯤 기다려요.
      if (peer.destroyed || attempts > (joined ? 60 : 2)) {
        setError(joined ? "방장과 연결이 끊겼어요." : "방을 찾지 못했어요. 코드와 방장 접속 상태를 확인해주세요.");
        setConnectionState("error");
        return;
      }
      if (joined) setConnectionState("reconnecting");
      retryRef.current = setTimeout(connect, 2000);
    };
    const connect = () => {
      if (peerRef.current !== peer || peer.destroyed) return;
      if (peer.disconnected) { peer.reconnect(); retry(); return; }
      const connection = peer.connect(peerIdFor(code), { reliable: true });
      hostConnectionRef.current = connection;
      let failed = false;
      const fail = () => { if (failed || hostConnectionRef.current !== connection) return; failed = true; clearTimeout(timeout); connection.close(); retry(); };
      const timeout = setTimeout(() => { if (!connection.open) fail(); }, 6000);
      connection.on("open", () => {
        clearTimeout(timeout);
        attempts = 0;
        joined = true;
        connection.send({ type: "join", profile });
        setRoomCode(code);
        if (!gameRef.current) setMode("lobby");
        setConnectionState("connected");
        history.replaceState(null, "", `?room=${code}`);
      });
      connection.on("data", (message) => {
        if (message.type === "lobby") setLobbyState(message.lobby);
        if (message.type === "game") { setGameState(message.game); setMode("game"); }
        if (message.type === "error") setError(message.message);
      });
      connection.on("close", fail);
    };
    peer.on("open", connect);
    peer.on("disconnected", () => reconnectSoon(peer));
    peer.on("error", (peerError) => {
      if (peerRef.current !== peer || peerError.type === "peer-unavailable") return; // 방장 부재는 연결 타임아웃이 재시도해요.
      if (!joined || peer.destroyed) { setError("친구 방에 연결하지 못했어요."); setConnectionState("error"); }
    });
  }, [cleanup, reconnectSoon, setGameState, setLobbyState]);

  // 탭이 새로 고쳐졌어도 주소의 방 코드가 저장된 방과 같으면 그 방으로 돌아가요.
  useEffect(() => {
    const session = loadSession();
    const params = new URLSearchParams(location.search);
    if (!session || params.get("demo") || params.get("room")?.toUpperCase() !== session.roomCode) return;
    if (session.isHost) hostRoom(session.profile, session);
    else joinRoom(session.profile, session.roomCode, session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    else setError("다시 연결하는 중이에요. 잠시 후 눌러주세요.");
  }, [runAction]);

  const leave = useCallback(() => {
    cleanup();
    localStorage.removeItem(SESSION_KEY);
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

function Landing({ onHost, onJoin, onSolo, onTutorial, connecting }) {
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
        <div className="landing-nav-actions"><button className="tutorial-nav-button" onClick={onTutorial}><BookOpenCheck size={17} /> 튜토리얼</button><button className="text-button" onClick={() => document.getElementById("rules")?.showModal()}><HelpCircle size={18} /> 규칙 요약</button></div>
      </nav>
      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> 혼자 또는 2–4인 온라인 보드게임</div>
          <h1>반짝이는 보석,<br /><em>친구와 한 판!</em></h1>
          <p>방 코드 하나로 모여 보석을 모으고, 카드를 사고, 귀족의 마음을 사로잡아 보세요.</p>
          <button className="tutorial-invite" type="button" onClick={onTutorial}>
            <img src="/assets/cards/hachiware.png" alt="" />
            <span><b>스플렌더가 처음인가요?</b><small>2·3·4인 규칙을 8단계로 연습해요</small></span><ChevronRight />
          </button>
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
        <button type="button" onClick={onTutorial}><BookOpenCheck /><strong>튜토리얼</strong><span>처음부터 차근차근</span></button>
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

function Lobby({ lobby, me, isHost, onStart, onLeave, onTutorial }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${location.origin}${location.pathname}?room=${lobby?.roomCode || ""}`;
  const inviteText = `보석친구 같이 하자! 방 코드 ${lobby?.roomCode}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(`${inviteText}\n${shareUrl}`);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  // 공유 시트는 화면을 떠나지 않고 카톡으로 보낼 수 있어요.
  const shareInvite = () => navigator.share({ title: "보석친구", text: inviteText, url: shareUrl }).catch(() => {});
  return (
    <main className="lobby-page">
      <div className="lobby-card">
        <div className="floating-gem gem-a">◆</div><div className="floating-gem gem-b">◆</div>
        <div className="eyebrow"><Users size={15} /> 친구를 기다리는 중</div>
        <h1>보석 파티 준비 완료!</h1>
        <p>친구에게 아래 코드를 알려주세요.</p>
        <button className="room-code" onClick={copyInvite} aria-label="초대 문구 복사"><span>{lobby?.roomCode || "·····"}</span>{copied ? <Check /> : <Copy />}</button>
        {typeof navigator.share === "function" && <button className="share-invite" onClick={shareInvite}><Share2 size={17} /> 친구에게 공유하기</button>}
        <p className="lobby-hint">다른 앱에 다녀와도 방은 그대로 유지돼요.</p>
        <div className="players-grid">
          {Array.from({ length: 4 }, (_, index) => {
            const player = lobby?.players[index];
            return player ? (
              <div className="lobby-player" key={player.id}><Avatar avatar={player.avatar} size="lg" /><strong>{player.name}</strong>{player.id === lobby.hostId && <span>방장</span>}{player.id === me?.id && <small>나</small>}</div>
            ) : <div className="lobby-player empty" key={index}><span className="empty-avatar">+</span><strong>빈 자리</strong><small>친구를 초대해요</small></div>;
          })}
        </div>
        {isHost ? <button className="primary-button start-button" disabled={!lobby || lobby.players.length < 2} onClick={onStart}><Play size={20} fill="currentColor" /> {!lobby || lobby.players.length < 2 ? "친구 한 명만 더!" : `${lobby.players.length}명으로 시작하기`}</button> : <div className="waiting-pill"><span /> 방장이 곧 시작해요</div>}
        <div className="lobby-secondary-actions"><button className="text-button" onClick={onTutorial}><BookOpenCheck size={17} /> 시작 전 튜토리얼</button><button className="text-button leave-button" onClick={onLeave}><LogOut size={17} /> 방 나가기</button></div>
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
  const meta = COLOR_META[card.bonus];
  return (
    <article className={`dev-card bonus-${card.bonus} ${canAct ? "is-actionable" : ""}`} style={{ "--bonus-color": meta.hex }}>
      <img className="card-art" src={`/assets/cards/${card.art}`} alt={`먼작귀 ${card.tier}단계 카드 일러스트 ${card.artVariant + 1}`} loading="eager" />
      <div className="card-top"><strong>{card.points || ""}</strong><span className={`card-bonus shape-${meta.shape}`} role="img" aria-label={`${meta.label} 보너스`} title={`${meta.label} 영구 할인`} /></div>
      <div className="cost-list">
        {COLORS.filter((color) => card.cost[color] > 0).map((color) => <MiniGem key={color} color={color} count={card.cost[color]} />)}
      </div>
      {canAct && <div className="card-actions">
        <button disabled={!affordable} onClick={onBuy}>{affordable ? "구매" : "부족"}</button>
        {source !== "reserved" && <button className="reserve-button" disabled={!onReserve} onClick={onReserve}>예약</button>}
      </div>}
    </article>
  );
}

function NobleCard({ noble, selectable, onClick }) {
  return (
    <button className={`noble-card ${selectable ? "selectable" : ""}`} onClick={onClick} disabled={!selectable} aria-label={`귀족 3점 · ${Object.entries(noble.cost).map(([color, count]) => `${COLOR_META[color].label} 카드 ${count}장`).join(", ")}`}><span><Crown size={15} /><strong>3</strong></span><div>{Object.entries(noble.cost).map(([color, count]) => <MiniGem key={color} color={color} count={count} />)}</div></button>
  );
}

// 예약 카드: 공개 카드에서 예약한 건 모두에게 보이고, 더미에서 뽑은 건 본인만 볼 수 있어요(실제 보드게임과 동일).
function ReservedChip({ card, hidden, mine, canBuy, onBuy }) {
  if (hidden) return <span className={`reserved-chip reserved-hidden deck-${card.tier}`} role="img" aria-label={`${card.tier}단계 비공개 예약 카드`}>{card.tier}<small>?</small></span>;
  const meta = COLOR_META[card.bonus];
  const label = `${card.tier}단계 ${meta.label} 카드${card.points ? ` ${card.points}점` : ""}`;
  const body = <><span className={`asset-card mini-${card.bonus}`}>{card.points || ""}</span><span className="reserved-cost">{COLORS.filter((color) => card.cost[color] > 0).map((color) => <MiniGem key={color} color={color} count={card.cost[color]} />)}</span></>;
  return mine
    ? <button className={`reserved-chip ${canBuy ? "can-buy" : ""}`} disabled={!canBuy} onClick={onBuy} aria-label={`예약한 ${label} ${canBuy ? "구매" : "· 아직 살 수 없음"}`}>{body}{canBuy && <em>구매</em>}</button>
    : <span className="reserved-chip" role="img" aria-label={`예약된 ${label}`}>{body}</span>;
}

function PlayerPanel({ player, active, me, canAct, onBuyReserved }) {
  const bonuses = playerBonuses(player);
  return (
    <section className={`player-panel ${active ? "active" : ""} ${me ? "me" : ""}`} aria-label={`${player.name} 현황`}>
      <div className="player-head">
        <Avatar avatar={player.avatar} size="sm" />
        <strong>{player.name}{me ? " · 나" : ""}{player.isBot && <em>{BOT_LEVELS[player.difficulty]?.label || "BOT"}</em>}</strong>
        {active && <i>차례</i>}
        {player.nobles.length > 0 && <span className="noble-owned" title={`귀족 ${player.nobles.length}명 · ${player.nobles.length * 3}점`}><Crown size={14} />{player.nobles.length}</span>}
        <b className="player-score" aria-label={`${playerScore(player)}점`}>{playerScore(player)}</b>
      </div>
      <div className="asset-row">
        {COLORS.map((color) => (
          <div className="asset-col" key={color} title={`${COLOR_META[color].label}: 카드 ${bonuses[color]}장 · 보석 ${player.tokens[color]}개`}>
            <span className={`asset-card mini-${color} ${bonuses[color] ? "" : "is-zero"}`} aria-label={`${COLOR_META[color].label} 카드 ${bonuses[color]}장`}>{bonuses[color]}</span>
            <span className={`asset-token mini-${color} ${player.tokens[color] ? "" : "is-zero"}`} aria-label={`${COLOR_META[color].label} 보석 ${player.tokens[color]}개`}>{player.tokens[color]}</span>
          </div>
        ))}
        <div className="asset-col" title={`골드 조커 ${player.tokens.gold}개`}>
          <span className="asset-total" aria-label={`개발 카드 ${player.cards.length}장`}>{player.cards.length}<small>장</small></span>
          <span className={`asset-token mini-gold ${player.tokens.gold ? "" : "is-zero"}`} aria-label={`골드 조커 ${player.tokens.gold}개`}>{player.tokens.gold}</span>
        </div>
        <div className="asset-col asset-sum"><small>보석</small><b>{tokenTotal(player)}/10</b></div>
      </div>
      {player.reserved.length > 0 && <div className="reserved-row" aria-label={`예약 카드 ${player.reserved.length}장`}>
        {player.reserved.map((card) => <ReservedChip key={card.id} card={card} hidden={!me && card.secret} mine={me} canBuy={me && canAct && Boolean(paymentFor(player, card))} onBuy={() => onBuyReserved(card)} />)}
      </div>}
    </section>
  );
}

function GameBoard({ game, me, roomCode, onAction, onLeave, onTutorial }) {
  const [selectedTokens, setSelectedTokens] = useState([]);
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
  const act = (action) => onAction(action);
  const buy = (card, source) => act({ type: "buy", source, cardId: card.id });
  const reserve = (card, tier) => act({ type: "reserve", source: String(tier), cardId: card.id });

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand"><span className="brand-gem">◆</span><span>보석친구</span><small className="room-chip">{roomCode}</small></div>
        <div className="turn-banner" aria-live="polite"><Avatar avatar={game.players[game.turn]?.avatar} size="sm" /><span>{game.status === "finished" ? "게임이 끝났어요" : isMyTurn ? "내 차례예요!" : `${game.players[game.turn]?.name}님의 차례`}</span><small>ROUND {game.round}</small><b className={timeLeft <= 10 ? "urgent" : ""}><Clock3 /> {game.status === "finished" ? "--" : timeLeft}</b></div>
        <div className="header-actions"><button onClick={onTutorial} aria-label="튜토리얼 열기"><BookOpenCheck /></button><button onClick={() => document.getElementById("rules")?.showModal()} aria-label="규칙 요약 열기"><HelpCircle /></button><button onClick={onLeave} aria-label="게임 나가기"><LogOut /></button></div>
      </header>
      <div className="game-layout">
        <div className="board-area">
          <div className="board-top-row">
            <section className="supply-section panel-card">
              <div className="section-title"><span>공급처</span>
                {selectedTokens.length > 0 && <><button className="take-confirm" disabled={!validSelection} onClick={() => act({ type: "take", colors: selectedTokens })}><Gem size={14} /> {validSelection ? `${selectedTokens.length}개 가져가기` : "3색 또는 같은 색 2개"}</button><button className="clear-pick" onClick={() => setSelectedTokens([])}>취소</button></>}
              </div>
              <div className="token-row">{ALL_TOKENS.map((color) => <Token key={color} color={color} count={game.supply[color]} selected={selectedTokens.filter((item) => item === color).length} onClick={color !== "gold" && canMainAction ? () => selectToken(color) : null} />)}</div>
            </section>
            <section className="nobles-section panel-card"><div className="section-title"><span>귀족 광장</span><small>카드 조건 달성 시 3점</small></div><div className="nobles-row">{game.nobles.length ? game.nobles.map((noble) => <NobleCard key={noble.id} noble={noble} />) : <small className="nobles-empty">모든 귀족이 떠났어요</small>}</div></section>
          </div>

          <section className="market panel-card" aria-label="개발 카드">
            {[3, 2, 1].map((tier) => <div className="market-row" key={tier}>
              <button className={`deck deck-${tier}`} disabled={!canMainAction || player?.reserved.length >= 3 || !game.decks[tier].length} onClick={() => act({ type: "reserve", source: String(tier) })} aria-label={`${tier}단계 더미 ${game.decks[tier].length}장 · 비공개 예약`}><span>{tier}</span><b>{game.decks[tier].length}</b><small>비공개 예약</small></button>
              <div className="cards-row">{game.board[tier].map((card) => <DevelopmentCard key={card.id} card={card} source={String(tier)} canAct={canMainAction} onBuy={paymentFor(player, card) ? () => buy(card, String(tier)) : null} onReserve={player?.reserved.length < 3 ? () => reserve(card, tier) : null} />)}</div>
            </div>)}
          </section>
        </div>

        <aside className="side-panel" aria-label="플레이어 현황">
          <div className="asset-legend"><span><i className="asset-card" /> 카드 보너스</span><span><i className="asset-token" /> 보석 토큰</span><span><Crown size={12} /> 귀족</span></div>
          <div className="players-stack">{game.players.map((item, index) => <PlayerPanel key={item.id} player={item} active={index === game.turn && game.status !== "finished"} me={item.id === me?.id} canAct={canMainAction} onBuyReserved={(card) => buy(card, "reserved")} />)}</div>
          <ol className="game-log" aria-label="최근 행동">{game.log.slice(0, 3).map((line, index) => <li key={`${game.log.length}-${index}-${line}`}>{line}</li>)}</ol>
        </aside>
      </div>
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

function DemoGame({ onTutorial }) {
  // ?demo=1 은 2인, ?demo=3·4 는 해당 인원으로 화면을 점검해요.
  const demoPlayers = useMemo(() => [
    { id: "demo-me", name: "준희", avatar: "chiikawa" },
    { id: "demo-friend", name: "보석친구", avatar: "hachiware" },
    { id: "demo-3", name: "우사기", avatar: "usagi" },
    { id: "demo-4", name: "모몽가", avatar: "momonga" },
  ].slice(0, Math.max(2, Number(new URLSearchParams(location.search).get("demo")) || 2)), []);
  const [demoGame, setDemoGame] = useState(() => createGame(demoPlayers, "DEMO1"));
  const demoMe = demoPlayers[0];
  const onAction = (action) => {
    try { setDemoGame((current) => applyAction(current, demoMe.id, action)); }
    catch { /* QA용 데모에서는 잘못된 동작을 그대로 무시해요. */ }
  };
  return <GameBoard game={demoGame} me={demoMe} roomCode="DEMO1" onAction={onAction} onLeave={() => { location.href = location.pathname; }} onTutorial={onTutorial} />;
}

function SoloGame({ profile, difficulty, onLeave, onTutorial }) {
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
  return <><GameBoard game={game} me={profile} roomCode={`SOLO · ${BOT_LEVELS[difficulty].label}`} onAction={onAction} onLeave={onLeave} onTutorial={onTutorial} />{error && <div className="global-error"><span>{error}</span><button onClick={() => setError("")} aria-label="오류 닫기"><X size={18} /></button></div>}</>;
}

export default function App() {
  const isDemo = new URLSearchParams(location.search).has("demo");
  const [soloConfig, setSoloConfig] = useState(null);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const multiplayer = useMultiplayer();
  let content;
  if (isDemo) content = <DemoGame onTutorial={() => setTutorialOpen(true)} />;
  else if (soloConfig) content = <SoloGame profile={soloConfig.profile} difficulty={soloConfig.difficulty} onLeave={() => setSoloConfig(null)} onTutorial={() => setTutorialOpen(true)} />;
  else content = (
    <>
      {multiplayer.mode === "landing" && <Landing onHost={multiplayer.hostRoom} onJoin={multiplayer.joinRoom} onSolo={(profile, difficulty) => setSoloConfig({ profile, difficulty })} onTutorial={() => setTutorialOpen(true)} connecting={multiplayer.connectionState} />}
      {multiplayer.mode === "lobby" && <Lobby lobby={multiplayer.lobby} me={multiplayer.me} isHost={multiplayer.isHost} onStart={multiplayer.startGame} onLeave={multiplayer.leave} onTutorial={() => setTutorialOpen(true)} />}
      {multiplayer.mode === "game" && multiplayer.game && <GameBoard game={multiplayer.game} me={multiplayer.me} roomCode={multiplayer.roomCode} onAction={multiplayer.sendAction} onLeave={multiplayer.leave} onTutorial={() => setTutorialOpen(true)} />}
      {multiplayer.connectionState === "reconnecting" && multiplayer.mode !== "landing" && <div className="reconnect-pill" role="status"><span /> 다시 연결하는 중…</div>}
      {multiplayer.error && <div className="global-error"><span>{multiplayer.error}</span><button onClick={() => multiplayer.setError("")} aria-label="오류 닫기"><X size={18} /></button></div>}
    </>
  );
  return (
    <>
      {content}
      {tutorialOpen && <TutorialDialog onClose={() => setTutorialOpen(false)} />}
    </>
  );
}
