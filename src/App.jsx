import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  viewFor,
} from "./game.js";
import { BOT_LEVELS, chooseBotAction, playTimedTurn } from "./bot.js";
import { openGuestLink, openHostLink } from "./net.js";
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
const publicProfile = ({ key, ...rest }) => rest; // 본인 확인용 key는 다른 사람에게 보내지 않아요.
const MSG_NOTFOUND = "방을 찾지 못했어요. 코드가 맞는지, 방장이 방 화면에 있는지 확인해주세요.";
const MSG_SERVER = "연결 서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.";
const BEAT_MS = 4000;
const HOST_SILENT_MS = 12000;

function useMultiplayer() {
  const [mode, setMode] = useState("landing");
  const [roomCode, setRoomCode] = useState("");
  const [lobby, setLobby] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [connectStatus, setConnectStatus] = useState("");
  const linkRef = useRef(null);
  const profileRef = useRef(null);
  const isHostRef = useRef(false);
  const lobbyRef = useRef(null);
  const gameRef = useRef(null);
  const sessionRef = useRef(null); // 연결이 한 번이라도 성립한 방. 있으면 끊겨도 계속 복구를 시도해요.
  const keysRef = useRef(new Map()); // 방장 전용: 플레이어 id → 본인 확인 key
  const seenRef = useRef(new Map()); // 방장 전용: 플레이어 id → 마지막 신호 시각
  const revRef = useRef(0);
  const guestRevRef = useRef(null);
  const lastSeenRef = useRef(0);
  const joinedRef = useRef(false);
  const downSinceRef = useRef(0);
  const lastRebuildRef = useRef(0);
  const hostIndexRef = useRef(0);
  const generationRef = useRef(0); // 낡은 연결에서 늦게 도착한 콜백을 무시하기 위한 번호
  const tickRef = useRef(() => {});

  const setLobbyState = useCallback((next) => { lobbyRef.current = next; setLobby(next); }, []);
  const setGameState = useCallback((next) => { gameRef.current = next; setGame(next); }, []);

  // 새로 고침이나 앱 전환 뒤에도 같은 방으로 돌아올 수 있게 방 상태를 저장해요.
  useEffect(() => {
    if (!roomCode || !profileRef.current) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      isHost: isHostRef.current, roomCode, profile: profileRef.current, lobby, game,
      keys: Object.fromEntries(keysRef.current), savedAt: Date.now(),
    }));
  }, [roomCode, lobby, game]);

  const closeLink = useCallback(() => {
    generationRef.current += 1;
    linkRef.current?.close();
    linkRef.current = null;
  }, []);
  useEffect(() => closeLink, [closeLink]);

  // ---------- 방장 ----------
  const sendTo = useCallback((id, message) => linkRef.current?.sendTo?.(id, { ...message, rev: revRef.current }), []);
  const sendLobbyTo = useCallback((id) => sendTo(id, { type: "lobby", lobby: lobbyRef.current }), [sendTo]);
  const sendGameTo = useCallback((id) => { if (gameRef.current) sendTo(id, { type: "game", game: viewFor(gameRef.current, id) }); }, [sendTo]);
  const sendStateTo = useCallback((id) => { sendLobbyTo(id); sendGameTo(id); }, [sendGameTo, sendLobbyTo]);
  const guestIds = () => (lobbyRef.current?.players || []).map((player) => player.id).filter((id) => id !== profileRef.current?.id);

  const publishLobby = useCallback((next) => {
    revRef.current += 1;
    setLobbyState(next);
    guestIds().forEach(sendLobbyTo);
  }, [sendLobbyTo, setLobbyState]);

  const publishGame = useCallback((next) => {
    revRef.current += 1;
    setGameState(next);
    guestIds().forEach(sendGameTo);
  }, [sendGameTo, setGameState]);

  const runAction = useCallback((playerId, action, replyTo = null) => {
    try {
      publishGame(applyAction(gameRef.current, playerId, action));
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "행동을 처리하지 못했어요.";
      if (replyTo) sendTo(replyTo, { type: "error", message });
      else setError(message);
    }
  }, [publishGame, sendTo]);

  const onGuestMessage = useCallback((message) => {
    if (!isHostRef.current || !message || typeof message !== "object") return;
    const current = lobbyRef.current;
    const id = message.from || message.profile?.id;
    if (!current || !id || !message.key) return;
    const known = current.players.some((player) => player.id === id);
    const knownKey = keysRef.current.get(id);
    if (knownKey && knownKey !== message.key) { sendTo(id, { type: "error", message: "이미 다른 기기가 쓰고 있는 자리예요." }); return; }
    seenRef.current.set(id, Date.now());

    if (message.type === "join") {
      const profile = message.profile;
      if (!profile?.name) return;
      if (current.status !== "waiting") {
        // 게임 중 끊겼던 플레이어는 같은 자리로 다시 들어와요.
        if (known && knownKey === message.key) sendStateTo(id);
        else sendTo(id, { type: "error", message: "이미 게임이 시작된 방이에요.", fatal: true });
        return;
      }
      if (!known && current.players.length >= 4) { sendTo(id, { type: "error", message: "방이 가득 찼어요.", fatal: true }); return; }
      keysRef.current.set(id, message.key);
      const clean = { ...publicProfile(profile), connected: true };
      const players = known ? current.players.map((player) => (player.id === id ? clean : player)) : [...current.players, clean];
      publishLobby({ ...current, players });
      return;
    }
    if (!known) return;
    if (message.type === "action") runAction(id, message.action, id);
    else if (message.type === "sync") sendStateTo(id);
    else if (message.type === "leave" && current.status === "waiting") {
      keysRef.current.delete(id);
      publishLobby({ ...current, players: current.players.filter((player) => player.id !== id) });
    }
  }, [publishLobby, runAction, sendStateTo, sendTo]);

  const hostRoom = useCallback(async (profile, resume = null) => {
    closeLink();
    const generation = generationRef.current;
    const code = resume?.roomCode || makeRoomCode();
    profileRef.current = profile;
    isHostRef.current = true;
    joinedRef.current = false;
    if (resume) {
      sessionRef.current = { isHost: true, code, profile };
      keysRef.current = new Map(Object.entries(resume.keys || {}));
      setRoomCode(code);
      setLobbyState(resume.lobby);
      setGameState(resume.game);
      setMode(resume.game ? "game" : "lobby");
    }
    setConnectionState(resume ? "reconnecting" : "connecting");
    setConnectStatus("방을 만드는 중…");
    revRef.current = Date.now();
    try {
      const link = await openHostLink({
        code, startIndex: hostIndexRef.current, onMessage: onGuestMessage,
        onChange: (ready) => { if (generationRef.current === generation) downSinceRef.current = ready ? 0 : (downSinceRef.current || Date.now()); },
      });
      if (generationRef.current !== generation) { link.close(); return; }
      linkRef.current = link;
      hostIndexRef.current = link.index;
      downSinceRef.current = 0;
      sessionRef.current = { isHost: true, code, profile };
      if (!lobbyRef.current) {
        setRoomCode(code);
        setLobbyState({ roomCode: code, status: "waiting", hostId: profile.id, players: [{ ...publicProfile(profile), connected: true }] });
        setMode("lobby");
      }
      setConnectionState("connected");
      setConnectStatus("");
      history.replaceState(null, "", `?room=${code}`);
      link.beat({ type: "beat", rev: revRef.current });
    } catch {
      if (generationRef.current !== generation) return;
      if (lobbyRef.current) { hostIndexRef.current += 1; return; } // 이미 열린 방은 감시 타이머가 다시 시도해요.
      closeLink();
      setError("방을 열지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.");
      setConnectionState("error");
      setConnectStatus("");
    }
  }, [closeLink, onGuestMessage, setGameState, setLobbyState]);

  // ---------- 친구 ----------
  const joinRoom = useCallback((profile, rawCode, resume = null) => {
    closeLink();
    const generation = generationRef.current;
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 5) { setError("5자리 방 코드를 확인해주세요."); return; }
    profileRef.current = profile;
    isHostRef.current = false;
    joinedRef.current = Boolean(resume);
    lastSeenRef.current = Date.now();
    guestRevRef.current = null;
    if (resume) {
      sessionRef.current = { isHost: false, code, profile };
      setRoomCode(code);
      setLobbyState(resume.lobby);
      setGameState(resume.game);
      setMode(resume.game ? "game" : "lobby");
    }
    setConnectionState(resume ? "reconnecting" : "connecting");
    setConnectStatus("연결 서버에 접속하는 중…");

    const link = openGuestLink({
      code, id: profile.id,
      onMessage: (message) => {
        if (generationRef.current !== generation || !message || typeof message !== "object") return;
        lastSeenRef.current = Date.now();
        if (message.type === "beat") {
          if (joinedRef.current) { setConnectionState("connected"); if (message.rev !== guestRevRef.current) sendUp({ type: "sync" }); }
          return;
        }
        if (message.type === "error") {
          setError(message.message);
          if (message.fatal) { sessionRef.current = null; closeLink(); setConnectionState("error"); setConnectStatus(""); if (!gameRef.current) setMode("landing"); }
          return;
        }
        if (message.type !== "lobby" && message.type !== "game") return;
        guestRevRef.current = message.rev;
        if (!joinedRef.current || sessionRef.current?.code !== code) {
          joinedRef.current = true;
          sessionRef.current = { isHost: false, code, profile };
          setRoomCode(code);
          history.replaceState(null, "", `?room=${code}`);
        }
        if (message.type === "lobby") setLobbyState(message.lobby);
        if (message.type === "game") { setGameState(message.game); setMode("game"); } else if (!gameRef.current) setMode("lobby");
        setConnectionState("connected");
        setConnectStatus("");
      },
      onChange: (connected) => {
        if (generationRef.current !== generation) return;
        if (connected) { downSinceRef.current = 0; sendUp({ type: "join", profile: publicProfile(profile) }); } else downSinceRef.current ||= Date.now();
      },
    });
    linkRef.current = link;
    function sendUp(message) { return link.publish({ ...message, from: profile.id, key: profile.key }); }
    linkRef.current.sendUp = sendUp;

    // 처음 입장은 방장의 응답을 기다리다가 3번 두드려보고 안 되면 알려줘요.
    if (!resume) {
      let tries = 0;
      const knock = () => {
        if (generationRef.current !== generation || joinedRef.current) return;
        tries += 1;
        if (tries > 4) {
          closeLink(); setError(link.connected() ? MSG_NOTFOUND : MSG_SERVER); setConnectionState("error"); setConnectStatus("");
          return;
        }
        setConnectStatus(!link.connected() ? "연결 서버에 접속하는 중…" : tries > 1 ? `방장을 찾는 중… (${tries}/4)` : "방장을 찾는 중…");
        if (link.connected()) sendUp({ type: "join", profile: publicProfile(profile) });
        setTimeout(knock, 3500);
      };
      setTimeout(knock, 1500);
    }
  }, [closeLink, setGameState, setLobbyState]);

  const resumeSaved = useCallback(() => {
    const session = loadSession();
    if (!session) return;
    if (session.isHost) hostRoom(session.profile, session); else joinRoom(session.profile, session.roomCode, session);
  }, [hostRoom, joinRoom]);

  // 탭이 새로 고쳐졌어도 주소의 방 코드가 저장된 방과 같으면 그 방으로 돌아가요.
  useEffect(() => {
    const session = loadSession();
    const params = new URLSearchParams(location.search);
    if (!session || params.has("demo") || params.get("room")?.toUpperCase() !== session.roomCode) return;
    resumeSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- 감시 타이머 ----------
  const rebuild = useCallback((force = false) => {
    const session = sessionRef.current;
    if (!session || !lobbyRef.current) return;
    const now = Date.now();
    if (!force && now - lastRebuildRef.current < 6000) return;
    lastRebuildRef.current = now;
    downSinceRef.current = 0;
    if (session.isHost) { hostIndexRef.current += 1; hostRoom(session.profile, { roomCode: session.code, lobby: lobbyRef.current, game: gameRef.current, keys: Object.fromEntries(keysRef.current) }); }
    else joinRoom(session.profile, session.code, { lobby: lobbyRef.current, game: gameRef.current });
  }, [hostRoom, joinRoom]);

  useEffect(() => {
    const tick = () => {
      const session = sessionRef.current;
      const link = linkRef.current;
      if (!session) return;
      if (!link) { rebuild(); return; }
      // 서버와 12초 넘게 끊겨 있으면 (방장은 다른 서버로) 연결을 새로 만들어요.
      if (!link.connected() && downSinceRef.current && Date.now() - downSinceRef.current > 12000) { rebuild(true); return; }
      if (session.isHost) {
        link.beat({ type: "beat", rev: revRef.current });
        const current = lobbyRef.current;
        // 대기실에서 신호가 25초 넘게 없는 친구는 자리를 비워줘요.
        if (current?.status === "waiting") {
          const gone = current.players.filter((player) => player.id !== profileRef.current?.id && Date.now() - (seenRef.current.get(player.id) || 0) > 25000);
          if (gone.length) publishLobby({ ...current, players: current.players.filter((player) => !gone.includes(player)) });
        }
        return;
      }
      if (!link.connected()) return;
      link.sendUp?.({ type: joinedRef.current ? "hb" : "join", profile: publicProfile(profileRef.current) });
      // 방장 신호가 12초 넘게 없으면 끊긴 걸로 보고 알려요. 신호가 다시 오면 알아서 돌아와요.
      if (joinedRef.current && Date.now() - lastSeenRef.current > HOST_SILENT_MS) {
        setConnectionState("reconnecting");
        link.sendUp({ type: "join", profile: publicProfile(profileRef.current) });
      }
    };
    tickRef.current = tick;
    const interval = setInterval(tick, BEAT_MS);
    const wake = () => { if (document.visibilityState !== "hidden") tick(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [publishLobby, rebuild]);

  // 방장 타이머: 30초 안에 행동이 없으면 자동 진행해요.
  useEffect(() => {
    if (!isHostRef.current || game?.status !== "playing" || !game.turnDeadline) return undefined;
    const deadline = game.turnDeadline;
    const timer = setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.status !== "playing" || current.turnDeadline !== deadline) return;
      try { publishGame(playTimedTurn(current, current.players[current.turn].id)); }
      catch { /* 다음 동기화에서 다시 시도할 수 있도록 게임 상태를 유지해요. */ }
    }, Math.max(0, deadline - Date.now()) + 30);
    return () => clearTimeout(timer);
  }, [game?.status, game?.turnDeadline, publishGame]);

  const retryNow = useCallback(() => rebuild(true), [rebuild]);

  const startGame = useCallback(() => {
    if (!isHostRef.current || lobbyRef.current.players.length < 2) return;
    const nextLobby = { ...lobbyRef.current, status: "playing" };
    publishLobby(nextLobby);
    publishGame(createGame(nextLobby.players, nextLobby.roomCode));
    setMode("game");
  }, [publishGame, publishLobby]);

  // 다시하기: 같은 방·같은 친구들로 새 판을 시작해요. 시작 순서는 한 칸씩 돌아가요.
  const rematch = useCallback(() => {
    const current = lobbyRef.current;
    if (!isHostRef.current || !current || gameRef.current?.status !== "finished") return;
    const players = [...current.players.slice(1), current.players[0]];
    publishLobby({ ...current, players });
    publishGame(createGame(players, current.roomCode, `${current.roomCode}-${Date.now()}`));
  }, [publishGame, publishLobby]);

  const sendAction = useCallback((action) => {
    const playerId = profileRef.current?.id;
    if (!playerId) return;
    if (isHostRef.current) runAction(playerId, action);
    else if (!linkRef.current?.sendUp?.({ type: "action", action })) setError("다시 연결하는 중이에요. 잠시 후 눌러주세요.");
  }, [runAction]);

  const leave = useCallback(() => {
    if (!isHostRef.current) linkRef.current?.sendUp?.({ type: "leave" });
    sessionRef.current = null;
    closeLink();
    localStorage.removeItem(SESSION_KEY);
    setMode("landing");
    setLobbyState(null);
    setGameState(null);
    setRoomCode("");
    setError("");
    setConnectionState("idle");
    setConnectStatus("");
    history.replaceState(null, "", location.pathname);
  }, [closeLink, setGameState, setLobbyState]);

  return {
    mode, roomCode, lobby, game, error, setError, connectionState, connectStatus,
    me: profileRef.current, isHost: isHostRef.current,
    hostRoom, joinRoom, resumeSaved, startGame, rematch, sendAction, leave, retryNow,
  };
}

function ReconnectPill({ onRetry, onLeave }) {
  const [since] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.floor((now - since) / 1000);
  return (
    <div className="reconnect-pill" role="status"><span /> 다시 연결하는 중… {seconds}초
      {seconds >= 8 && <button onClick={onRetry}>다시 시도</button>}
      <button onClick={onLeave}>나가기</button>
    </div>
  );
}

function Avatar({ avatar, size = "md" }) {
  const item = AVATARS[LEGACY_AVATARS[avatar] || avatar] || AVATARS.chiikawa;
  return <span className={`avatar avatar-${size}`} style={{ "--avatar-bg": item.color }} aria-label={item.label}><img src={item.image} alt="" /></span>;
}

function Landing({ onHost, onJoin, onResume, onSolo, onTutorial, onCancel, connecting, status }) {
  const saved = loadSession();
  const initialRoom = new URLSearchParams(location.search).get("room")?.toUpperCase() || "";
  const [name, setName] = useState(localStorage.getItem("gemfriends-name") || "");
  const savedAvatar = localStorage.getItem("gemfriends-avatar");
  const [avatar, setAvatar] = useState(AVATARS[savedAvatar] ? savedAvatar : (LEGACY_AVATARS[savedAvatar] || "chiikawa"));
  const [room, setRoom] = useState(initialRoom);
  const [difficulty, setDifficulty] = useState(localStorage.getItem("gemfriends-bot-level") || "intermediate");

  const [formMessage, setFormMessage] = useState("");
  const busy = connecting === "connecting";

  const profile = () => {
    const cleanName = name.trim().slice(0, 10);
    // 이름이 비어 있으면 아무 반응이 없는 것처럼 보이지 않도록 바로 알려줘요.
    if (!cleanName) { setFormMessage("이름을 먼저 적어주세요."); document.getElementById("player-name")?.focus(); return null; }
    setFormMessage("");
    localStorage.setItem("gemfriends-name", cleanName);
    localStorage.setItem("gemfriends-avatar", avatar);
    const savedId = localStorage.getItem("gemfriends-id") || makeId();
    localStorage.setItem("gemfriends-id", savedId);
    const savedKey = localStorage.getItem("gemfriends-key") || makeId(); // 내 자리를 다른 사람이 쓰지 못하게 하는 본인 확인용 값
    localStorage.setItem("gemfriends-key", savedKey);
    return { id: savedId, name: cleanName, avatar, key: savedKey };
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
            <label>플레이어 이름<input id="player-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="이름을 적어주세요" maxLength={10} /></label>
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
            {saved && connecting !== "connecting" && <button type="button" className="resume-room" onClick={onResume}><b>방 {saved.roomCode} 이어서 하기</b><small>{saved.game ? "진행 중이던 게임으로 돌아가요" : "대기실로 돌아가요"}</small><ChevronRight size={18} /></button>}
            <div className="room-actions">
              <button className="primary-button" disabled={busy} onClick={() => { const p = profile(); if (p) onHost(p); }}><Play size={19} fill="currentColor" /> 새 방 만들기</button>
              <form className="join-row" onSubmit={(event) => {
                event.preventDefault();
                if (room.length !== 5) { setFormMessage("방 코드 5자리를 입력해주세요."); return; }
                const p = profile(); if (p) onJoin(p, room);
              }}>
                <input aria-label="방 코드" value={room} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} onChange={(event) => { setFormMessage(""); setRoom(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5)); }} placeholder="방 코드 5자리" />
                <button type="submit" disabled={busy}>입장 <ChevronRight size={18} /></button>
              </form>
              {formMessage && <p className="form-message" role="alert">{formMessage}</p>}
              {busy && <div className="connect-status" role="status"><span className="spinner" /><b>{status || "연결하는 중…"}</b><button type="button" onClick={onCancel}>취소</button></div>}
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
    <article className={`dev-card bonus-${card.bonus} ${canAct ? "is-actionable" : ""} ${onBuy ? "can-afford" : ""}`} style={{ "--bonus-color": meta.hex }}>
      <img className="card-art" src={`/assets/cards/${card.art}`} alt={`먼작귀 ${card.tier}단계 카드 일러스트 ${card.artVariant + 1}`} loading="eager" />
      <div className="card-top"><strong>{card.points || ""}</strong><span className={`card-bonus shape-${meta.shape}`} role="img" aria-label={`${meta.label} 보너스`} title={`${meta.label} 영구 할인`} /></div>
      {onBuy && !canAct && <span className="afford-badge" role="img" aria-label="지금 가진 보석으로 살 수 있는 카드"><Check size={12} /></span>}
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

function NobleCard({ noble, selectable, onClick, bonuses }) {
  const costs = Object.entries(noble.cost);
  const ready = bonuses && costs.every(([color, count]) => bonuses[color] >= count);
  return (
    <button className={`noble-card ${selectable ? "selectable" : ""} ${ready ? "ready" : ""}`} onClick={onClick} disabled={!selectable} aria-label={`귀족 3점 · ${costs.map(([color, count]) => `${COLOR_META[color].label} 카드 ${count}장${bonuses ? ` (내 카드 ${Math.min(bonuses[color], count)}장)` : ""}`).join(", ")}`}>
      <span><Crown size={15} /><strong>3</strong></span>
      <div>{costs.map(([color, count]) => <span key={color} className={`noble-need ${bonuses && bonuses[color] >= count ? "met" : ""}`}><MiniGem color={color} count={count} />{bonuses && <small>{Math.min(bonuses[color], count)}/{count}</small>}</span>)}</div>
    </button>
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
        <small className={`token-sum ${tokenTotal(player) >= 9 ? "near-limit" : ""}`} aria-label={`보석 ${tokenTotal(player)}개 보유, 최대 10개`}><Gem size={11} />{tokenTotal(player)}/10</small>
        <b className="player-score" key={playerScore(player)} aria-label={`${playerScore(player)}점`}>{playerScore(player)}</b>
      </div>
      <div className="asset-row">
        {COLORS.map((color) => (
          <div className="asset-col" key={color} title={`${COLOR_META[color].label}: 카드 ${bonuses[color]}장 · 보석 ${player.tokens[color]}개`}>
            <span className={`asset-card mini-${color} ${bonuses[color] ? "" : "is-zero"}`} aria-label={`${COLOR_META[color].label} 카드 ${bonuses[color]}장`}>{bonuses[color]}</span>
            <span className={`asset-token mini-${color} ${player.tokens[color] ? "" : "is-zero"}`} aria-label={`${COLOR_META[color].label} 보석 ${player.tokens[color]}개`}>{player.tokens[color]}</span>
          </div>
        ))}
        <div className="asset-col" title={`골드 조커 ${player.tokens.gold}개`}>
          <span className="asset-total" aria-label={`개발 카드 모두 ${player.cards.length}장`} title="산 카드 합계">{player.cards.length}<small>장</small></span>
          <span className={`asset-token mini-gold ${player.tokens.gold ? "" : "is-zero"}`} aria-label={`골드 조커 ${player.tokens.gold}개`}>{player.tokens.gold}</span>
        </div>
      </div>
      {player.reserved.length > 0 && <div className="reserved-row" aria-label={`예약 카드 ${player.reserved.length}장`}>
        {player.reserved.map((card) => <ReservedChip key={card.id} card={card} hidden={!me && card.secret} mine={me} canBuy={me && canAct && Boolean(paymentFor(player, card))} onBuy={() => onBuyReserved(card)} />)}
      </div>}
    </section>
  );
}

function GameBoard({ game, me, roomCode, onAction, onLeave, onTutorial, onRematch = null, rematchNote = "" }) {
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000)));
  const player = game.players.find((item) => item.id === me?.id);
  const isMyTurn = game.status === "playing" && game.players[game.turn]?.id === me?.id;
  const canMainAction = isMyTurn && !game.pending;

  useEffect(() => { setSelectedTokens([]); }, [game.turn, game.round]);
  // 내 차례가 오면 폰이 살짝 진동해요.
  useEffect(() => { if (isMyTurn && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(120); }, [isMyTurn]);
  // 게임 중에는 화면이 꺼지지 않게 해요(화면이 꺼지면 연결도 끊기기 쉬워요).
  useEffect(() => {
    let lock = null;
    const acquire = () => { if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((value) => { lock = value; }).catch(() => {}); };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { document.removeEventListener("visibilitychange", acquire); lock?.release().catch(() => {}); };
  }, []);
  const myBonuses = player ? playerBonuses(player) : null;
  const confirmLeave = () => { if (game.status !== "playing" || window.confirm("게임에서 나갈까요? 진행 중인 판을 떠나게 돼요.")) onLeave(); };
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
        <div className={`turn-banner ${isMyTurn ? "mine" : ""}`} aria-live="polite"><Avatar avatar={game.players[game.turn]?.avatar} size="sm" /><span>{game.status === "finished" ? "게임이 끝났어요" : isMyTurn ? "내 차례예요!" : `${game.players[game.turn]?.name}님의 차례`}</span>{game.finalRound && game.status === "playing" ? <small className="final-chip">마지막 라운드!</small> : <small>ROUND {game.round}</small>}<b className={timeLeft <= 10 ? "urgent" : ""}><Clock3 /> {game.status === "finished" ? "--" : timeLeft}</b></div>
        <div className="header-actions"><button onClick={onTutorial} aria-label="튜토리얼 열기"><BookOpenCheck /></button><button onClick={() => document.getElementById("rules")?.showModal()} aria-label="규칙 요약 열기"><HelpCircle /></button><button onClick={confirmLeave} aria-label="게임 나가기"><LogOut /></button></div>
        {game.status === "playing" && <div className={`turn-timer ${timeLeft <= 10 ? "urgent" : ""}`} aria-hidden="true"><span style={{ width: `${Math.min(100, (timeLeft / 30) * 100)}%` }} /></div>}
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
            <section className="nobles-section panel-card"><div className="section-title"><span>귀족 광장</span><small>카드 조건 달성 시 3점</small></div><div className="nobles-row">{game.nobles.length ? game.nobles.map((noble) => <NobleCard key={noble.id} noble={noble} bonuses={myBonuses} />) : <small className="nobles-empty">모든 귀족이 떠났어요</small>}</div></section>
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
      {game.status === "finished" && <WinnerModal game={game} me={me} onLeave={onLeave} onRematch={onRematch} rematchNote={rematchNote} />}
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

function WinnerModal({ game, me, onLeave, onRematch, rematchNote }) {
  const winners = game.players.filter((player) => game.winnerIds.includes(player.id));
  const won = game.winnerIds.includes(me?.id);
  const ranked = [...game.players].sort((a, b) => playerScore(b) - playerScore(a) || a.cards.length - b.cards.length);
  return (
    <div className="modal-backdrop celebration"><div className="winner-modal" role="dialog" aria-modal="true" aria-label="게임 결과">
      <div className="winner-crown">👑</div>
      <span>{won ? "내가 해냈어요!" : "멋진 승부였어요!"}</span>
      <h1>{winners.map((player) => player.name).join(", ")} 승리</h1>
      <p>동점일 때는 구매한 개발 카드가 더 적은 플레이어가 승리해요.</p>
      <div className="scoreboard">{ranked.map((player, index) => <div key={player.id} className={game.winnerIds.includes(player.id) ? "is-winner" : ""}><b>{index + 1}</b><Avatar avatar={player.avatar} /><span>{player.name}{player.id === me?.id ? " · 나" : ""}</span><strong>{playerScore(player)}점</strong><small>카드 {player.cards.length}장 · 귀족 {player.nobles.length}</small></div>)}</div>
      {onRematch && <button className="primary-button" onClick={onRematch}><RotateCcw size={18} /> 같은 방에서 다시하기</button>}
      {!onRematch && rematchNote && <div className="waiting-pill"><span /> {rematchNote}</div>}
      <button className="text-button winner-leave" onClick={onLeave}><LogOut size={16} /> 나가기</button>
    </div></div>
  );
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
  const rematch = () => setGame((current) => createGame([...current.players].reverse().map((player) => (player.id === bot.id ? bot : profile)), current.roomCode, `${current.roomCode}-${Date.now()}`));
  return <><GameBoard game={game} me={profile} roomCode={`SOLO · ${BOT_LEVELS[difficulty].label}`} onAction={onAction} onLeave={onLeave} onTutorial={onTutorial} onRematch={rematch} />{error && <div className="global-error"><span>{error}</span><button onClick={() => setError("")} aria-label="오류 닫기"><X size={18} /></button></div>}</>;
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
      {multiplayer.mode === "landing" && <Landing onHost={multiplayer.hostRoom} onJoin={multiplayer.joinRoom} onSolo={(profile, difficulty) => setSoloConfig({ profile, difficulty })} onTutorial={() => setTutorialOpen(true)} onResume={multiplayer.resumeSaved} onCancel={multiplayer.leave} connecting={multiplayer.connectionState} status={multiplayer.connectStatus} />}
      {multiplayer.mode === "lobby" && <Lobby lobby={multiplayer.lobby} me={multiplayer.me} isHost={multiplayer.isHost} onStart={multiplayer.startGame} onLeave={multiplayer.leave} onTutorial={() => setTutorialOpen(true)} />}
      {multiplayer.mode === "game" && multiplayer.game && <GameBoard game={multiplayer.game} me={multiplayer.me} roomCode={multiplayer.roomCode} onAction={multiplayer.sendAction} onLeave={multiplayer.leave} onTutorial={() => setTutorialOpen(true)} onRematch={multiplayer.isHost ? multiplayer.rematch : null} rematchNote="방장이 다시하기를 누르면 바로 새 판이 시작돼요" />}
      {multiplayer.connectionState === "reconnecting" && multiplayer.mode !== "landing" && <ReconnectPill onRetry={multiplayer.retryNow} onLeave={multiplayer.leave} />}
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
