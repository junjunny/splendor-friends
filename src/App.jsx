import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, Bot, Check, CheckCircle2, ChevronRight, Circle, Clock3, Copy, Crown, Gem, HelpCircle, Hourglass, LockKeyhole, LogOut, MessageCircle, Play, RotateCcw, Share2, Sparkles, Star, Users, WifiOff, X } from "lucide-react";
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
import { EMOTES, QUICK_CHATS, mascotLine, reactionFor } from "./mascots.js";
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
const SESSION_KEY = "gemfriends-session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const loadSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!session?.roomCode || !session?.profile || !session?.sessionToken || Date.now() - session.savedAt >= SESSION_TTL_MS) return null;
    return session;
  } catch { return null; }
};

function useMultiplayer() {
  const [mode, setMode] = useState("landing");
  const [roomCode, setRoomCode] = useState("");
  const [lobby, setLobby] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [connectStatus, setConnectStatus] = useState("");
  const [emote, setEmote] = useState(null);
  const [rematchPending, setRematchPending] = useState(false);
  const profileRef = useRef(null);
  const lobbyRef = useRef(null);
  const gameRef = useRef(null);
  const roomCodeRef = useRef("");
  const sessionTokenRef = useRef("");
  const versionRef = useRef(0);
  const gameVersionRef = useRef(-1);
  const stoppedRef = useRef(true);
  const pollTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const actionInFlightRef = useRef(false);
  const emoteIdRef = useRef(null);

  const persistRoom = useCallback((overrides = {}) => {
    if (!roomCodeRef.current || !profileRef.current || !sessionTokenRef.current) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      isHost: lobbyRef.current?.hostId === profileRef.current.id,
      role: lobbyRef.current?.hostId === profileRef.current.id ? "host" : "guest",
      roomCode: roomCodeRef.current,
      profile: profileRef.current,
      sessionToken: sessionTokenRef.current,
      lobby: lobbyRef.current,
      game: gameRef.current,
      savedAt: Date.now(),
      ...overrides,
    }));
  }, []);

  const setLobbyState = useCallback((next) => { lobbyRef.current = next; setLobby(next); persistRoom({ lobby: next }); }, [persistRoom]);
  const setGameState = useCallback((next) => { gameRef.current = next; setGame(next); persistRoom({ game: next }); }, [persistRoom]);

  const cleanup = useCallback(() => {
    stoppedRef.current = true;
    clearTimeout(pollTimerRef.current);
    clearTimeout(heartbeatTimerRef.current);
  }, []);
  useEffect(() => cleanup, [cleanup]);

  const api = useCallback(async (body) => {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(payload.error || "서버와 연결하지 못했어요.");
      requestError.code = payload.code;
      requestError.status = response.status;
      throw requestError;
    }
    return payload;
  }, []);

  const applyServerState = useCallback((payload) => {
    if (payload.emote?.id && payload.emote.id !== emoteIdRef.current) {
      emoteIdRef.current = payload.emote.id;
      setEmote(payload.emote);
    }
    if (payload.unchanged) return;
    if (payload.sessionToken) sessionTokenRef.current = payload.sessionToken;
    if (payload.version !== undefined) versionRef.current = payload.version;
    if (payload.gameVersion !== undefined) gameVersionRef.current = payload.gameVersion;
    if (payload.lobby) {
      roomCodeRef.current = payload.lobby.roomCode;
      setRoomCode(payload.lobby.roomCode);
      setLobbyState(payload.lobby);
    }
    if (Object.hasOwn(payload, "game")) {
      setGameState(payload.game);
      setMode(payload.game ? "game" : "lobby");
    } else if (payload.lobby && !gameRef.current) setMode("lobby");
    persistRoom();
  }, [persistRoom, setGameState, setLobbyState]);

  const credentials = useCallback(() => ({
    code: roomCodeRef.current,
    playerId: profileRef.current?.id,
    sessionToken: sessionTokenRef.current,
  }), []);

  const syncOnce = useCallback(async () => {
    if (!roomCodeRef.current || !profileRef.current || !sessionTokenRef.current) return;
    const payload = await api({ op: "sync", ...credentials(), knownVersion: versionRef.current, knownGameVersion: gameVersionRef.current });
    applyServerState(payload);
    setConnectionState("connected");
    setConnectStatus("");
  }, [api, applyServerState, credentials]);

  const beginSync = useCallback(() => {
    stoppedRef.current = false;
    clearTimeout(pollTimerRef.current);
    clearTimeout(heartbeatTimerRef.current);
    const poll = async () => {
      if (stoppedRef.current) return;
      try { await syncOnce(); }
      catch (syncError) {
        if (["SESSION_EXPIRED", "ROOM_NOT_FOUND"].includes(syncError.code)) {
          cleanup();
          localStorage.removeItem(SESSION_KEY);
          setMode("landing");
          setError(syncError.message);
          setConnectionState("error");
          return;
        }
        setConnectionState("reconnecting");
      }
      pollTimerRef.current = setTimeout(poll, document.visibilityState === "visible" ? 1200 : 3000);
    };
    const heartbeat = async () => {
      if (stoppedRef.current || !profileRef.current) return;
      try { await api({ op: "heartbeat", ...credentials() }); }
      catch { /* 폴링이 연결 상태를 계속 복구해요. */ }
      heartbeatTimerRef.current = setTimeout(heartbeat, 12_000);
    };
    poll();
    heartbeat();
  }, [api, cleanup, credentials, syncOnce]);

  const enterRoom = useCallback((profile, payload) => {
    profileRef.current = profile;
    sessionTokenRef.current = payload.sessionToken;
    roomCodeRef.current = payload.lobby.roomCode;
    applyServerState(payload);
    setConnectionState("connected");
    setConnectStatus("");
    setError("");
    history.replaceState(null, "", `?room=${payload.lobby.roomCode}`);
    persistRoom();
    beginSync();
  }, [applyServerState, beginSync, persistRoom]);

  const hostRoom = useCallback(async (profile) => {
    cleanup();
    localStorage.removeItem(SESSION_KEY);
    setConnectionState("connecting");
    setConnectStatus("안전한 서버 방을 만드는 중…");
    try { enterRoom(profile, await api({ op: "create", profile })); }
    catch (requestError) { setError(requestError.message); setConnectionState("error"); setConnectStatus(""); }
  }, [api, cleanup, enterRoom]);

  const joinRoom = useCallback(async (profile, rawCode, resume = null) => {
    const code = rawCode.trim().toUpperCase();
    if (code.length !== 5) { setError("5자리 방 코드를 확인해주세요."); return; }
    cleanup();
    if (!resume) localStorage.removeItem(SESSION_KEY);
    setConnectionState(resume ? "reconnecting" : "connecting");
    setConnectStatus("서버의 방을 찾는 중…");
    try {
      const payload = await api({ op: "join", code, profile, sessionToken: resume?.sessionToken || "" });
      enterRoom(profile, payload);
    } catch (requestError) {
      if (resume) localStorage.removeItem(SESSION_KEY);
      setMode("landing");
      setError(requestError.message);
      setConnectionState("error");
      setConnectStatus("");
    }
  }, [api, cleanup, enterRoom]);

  const resumeSaved = useCallback(() => {
    const session = loadSession();
    if (!session) return;
    joinRoom(session.profile, session.roomCode, session);
  }, [joinRoom]);

  // 탭이 새로 고쳐졌어도 주소의 방 코드가 저장된 방과 같으면 그 방으로 돌아가요.
  useEffect(() => {
    const session = loadSession();
    const params = new URLSearchParams(location.search);
    if (!session || params.has("demo") || params.get("room")?.toUpperCase() !== session.roomCode) return;
    resumeSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "hidden" || !roomCodeRef.current) return;
      setConnectionState("reconnecting");
      api({ op: "heartbeat", ...credentials() }).catch(() => undefined).finally(() => syncOnce().catch(() => undefined));
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [api, credentials, syncOnce]);

  const retryNow = useCallback(() => {
    setConnectionState("reconnecting");
    if (stoppedRef.current) beginSync(); else syncOnce().catch(() => undefined);
  }, [beginSync, syncOnce]);

  const startGame = useCallback(async () => {
    if (!profileRef.current || lobbyRef.current?.hostId !== profileRef.current.id || lobbyRef.current.players.length < 2) return;
    try { applyServerState(await api({ op: "start", ...credentials() })); }
    catch (requestError) { setError(requestError.message); }
  }, [api, applyServerState, credentials]);

  const rematch = useCallback(async () => {
    if (!profileRef.current || lobbyRef.current?.hostId !== profileRef.current.id || gameRef.current?.status !== "finished") return;
    const request = { op: "rematch", ...credentials(), startRequestId: makeId() };
    setRematchPending(true);
    try {
      let payload;
      try { payload = await api(request); }
      catch (requestError) {
        if (requestError.status) throw requestError;
        await new Promise((resolve) => setTimeout(resolve, 250));
        payload = await api(request);
      }
      applyServerState(payload);
    } catch (requestError) {
      await syncOnce().catch(() => undefined);
      setError(requestError.message);
    } finally { setRematchPending(false); }
  }, [api, applyServerState, credentials, syncOnce]);

  const setStatus = useCallback(async (status) => {
    if (!profileRef.current) return;
    const request = { op: "status", ...credentials(), eventId: makeId(), ...status };
    try {
      let payload;
      try { payload = await api(request); }
      catch (requestError) {
        if (requestError.status && requestError.code !== "VERSION_CONFLICT") throw requestError;
        await new Promise((resolve) => setTimeout(resolve, 150));
        payload = await api(request);
      }
      applyServerState(payload);
    }
    catch (requestError) { await syncOnce().catch(() => undefined); setError(requestError.message); }
  }, [api, applyServerState, credentials, syncOnce]);

  const sendAction = useCallback(async (action) => {
    const playerId = profileRef.current?.id;
    if (!playerId || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    const request = { op: "action", ...credentials(), actionId: makeId(), action };
    try {
      let payload;
      try { payload = await api(request); }
      catch (requestError) {
        if (requestError.status) throw requestError;
        await new Promise((resolve) => setTimeout(resolve, 250));
        payload = await api(request);
      }
      applyServerState(payload);
    } catch (requestError) {
      if (requestError.code === "VERSION_CONFLICT") await syncOnce().catch(() => undefined);
      setError(requestError.message);
    } finally { actionInFlightRef.current = false; }
  }, [api, applyServerState, credentials, syncOnce]);

  const sendEmote = useCallback(async (key) => {
    const playerId = profileRef.current?.id;
    if (!playerId || !EMOTES.some((item) => item.key === key)) return;
    const optimistic = { id: `${Date.now()}-${playerId}`, playerId, key };
    emoteIdRef.current = optimistic.id;
    setEmote(optimistic);
    const request = { op: "emote", ...credentials(), key, emoteId: optimistic.id };
    try {
      let payload;
      try { payload = await api(request); }
      catch (requestError) {
        if (requestError.status && requestError.code !== "VERSION_CONFLICT") throw requestError;
        await new Promise((resolve) => setTimeout(resolve, 150));
        payload = await api(request);
      }
      applyServerState(payload);
    } catch { await syncOnce().catch(() => undefined); /* 빠른 대화 실패는 게임 진행을 막지 않아요. */ }
  }, [api, applyServerState, credentials, syncOnce]);

  const leave = useCallback(() => {
    const current = credentials();
    cleanup();
    if (current.code && current.playerId) api({ op: "leave", ...current }).catch(() => undefined);
    localStorage.removeItem(SESSION_KEY);
    roomCodeRef.current = "";
    sessionTokenRef.current = "";
    versionRef.current = 0;
    gameVersionRef.current = -1;
    profileRef.current = null;
    setMode("landing");
    setLobbyState(null);
    setGameState(null);
    setRoomCode("");
    setError("");
    setConnectionState("idle");
    setConnectStatus("");
    history.replaceState(null, "", location.pathname);
  }, [api, cleanup, credentials, setGameState, setLobbyState]);

  return {
    mode, roomCode, lobby, game, error, setError, connectionState, connectStatus, emote, sendEmote, rematchPending,
    me: profileRef.current, isHost: Boolean(profileRef.current && lobby?.hostId === profileRef.current.id),
    hostRoom, joinRoom, resumeSaved, startGame, rematch, setStatus, sendAction, leave, retryNow,
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

function PlayerPanel({ player, active, me, canAct, onBuyReserved, bubble, roundId }) {
  const bonuses = playerBonuses(player);
  return (
    <section className={`player-panel ${active ? "active" : ""} ${me ? "me" : ""}`} aria-label={`${player.name} 현황`}>
      {bubble && <p className="speech" key={bubble.id} role="status"><b>{bubble.emoji}</b>{bubble.text}</p>}
      <div className="player-head">
        <Avatar avatar={player.avatar} size="sm" />
        <strong>{player.name}{me ? " · 나" : ""}{player.isBot && <em>{BOT_LEVELS[player.difficulty]?.label || "BOT"}</em>}</strong>
        {player.lastGameRoundId === roundId && <span className="last-game-badge"><Star size={11} fill="currentColor" /> 막판</span>}
        {player.connected === false && <span className="offline-badge"><WifiOff size={11} /> 연결 중</span>}
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

function GameBoard({ game, lobby = null, me, roomCode, onAction, onLeave, onTutorial, onRematch = null, rematchPending = false, emote = null, onEmote = null, onStatus = null }) {
  const [bubbles, setBubbles] = useState({});
  const seenSeqRef = useRef(game.seq || 0);
  const seenEmoteRef = useRef(emote?.id);
  const [selectedTokens, setSelectedTokens] = useState([]);
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((game.turnDeadline - Date.now()) / 1000)));
  const lobbyById = useMemo(() => new Map((lobby?.players || []).map((item) => [item.id, item])), [lobby?.players]);
  const player = { ...game.players.find((item) => item.id === me?.id), ...(lobbyById.get(me?.id) || {}) };
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
  // 말풍선: 카드를 사거나 귀족이 오면 그 친구가 한마디 하고, 감정표현을 보내면 그 말이 떠요.
  const say = (playerId, key, emoji = "") => {
    const speaker = game.players.find((item) => item.id === playerId);
    const text = speaker && mascotLine(speaker.avatar, key);
    if (!text) return;
    const id = `${Date.now()}-${key}`;
    setBubbles((current) => ({ ...current, [playerId]: { id, text, emoji } }));
    setTimeout(() => setBubbles((current) => (current[playerId]?.id === id ? { ...current, [playerId]: null } : current)), 2600);
  };
  useEffect(() => {
    const seen = seenSeqRef.current;
    seenSeqRef.current = game.seq || 0;
    if ((game.seq || 0) < seen) return; // 다시하기로 새 판이 시작됐어요.
    [...(game.activity || [])].reverse().filter((entry) => entry.seq > seen).forEach((entry) => { const key = reactionFor(entry); if (key) say(entry.playerId, key); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.seq]);
  useEffect(() => {
    if (!emote || emote.id === seenEmoteRef.current) return;
    seenEmoteRef.current = emote.id;
    say(emote.playerId, emote.key, EMOTES.find((item) => item.key === emote.key)?.emoji);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emote]);
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
          <div className="players-stack">{game.players.map((item, index) => <PlayerPanel key={item.id} player={{ ...item, ...(lobbyById.get(item.id) || {}) }} active={index === game.turn && game.status !== "finished"} me={item.id === me?.id} canAct={canMainAction} onBuyReserved={(card) => buy(card, "reserved")} bubble={bubbles[item.id]} roundId={lobby?.roundId} />)}</div>
          {onEmote && player && game.status === "playing" && <div className="emote-bar" role="group" aria-label="빠른 대화 보내기">{EMOTES.filter((item) => item.contexts.includes("playing")).map((item) => <button key={item.key} type="button" onClick={() => onEmote(item.key)} aria-label={`${item.label}: ${mascotLine(player.avatar, item.key)}`} title={mascotLine(player.avatar, item.key)}>{item.emoji}</button>)}{onStatus && player.lastGameRoundId === lobby?.roundId && <button className="cancel-last-game" type="button" onClick={() => onStatus({ lastGameCurrent: false })} aria-label="이번 판이 막판 설정 취소" title="막판 설정 취소">취소</button>}</div>}
          <ol className="game-log" aria-label="최근 행동">{game.log.slice(0, 2).map((line, index) => <li key={`${game.log.length}-${index}-${line}`}>{line}</li>)}</ol>
        </aside>
      </div>
      {game.pending?.type === "discard" && game.pending.playerId === me?.id && <DiscardModal player={player} count={game.pending.count} onConfirm={(tokens) => act({ type: "discard", tokens })} />}
      {game.pending?.type === "noble" && game.pending.playerId === me?.id && <NobleModal nobles={game.nobles.filter((noble) => game.pending.nobleIds.includes(noble.id))} onChoose={(nobleId) => act({ type: "noble", nobleId })} />}
      {game.status === "finished" && <WinnerModal game={game} lobby={lobby} me={me} onLeave={onLeave} onRematch={onRematch} rematchPending={rematchPending} emote={emote} onEmote={onEmote} onStatus={onStatus} />}
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

function RematchPlayer({ player, hostId, meId, roundId, bubble }) {
  const isHost = player.id === hostId;
  const finishedLastGame = player.lastGameRoundId === roundId;
  const status = !player.connected ? "연결 기다림" : player.leaveIntent ? "여기까지" : player.waiting ? "잠시 대기" : isHost ? "방장" : player.ready ? "준비 완료" : "대기 중";
  return (
    <div className={`rematch-player ${player.ready ? "is-ready" : ""} ${!player.connected ? "is-offline" : ""}`}>
      {bubble && <p className="rematch-speech" role="status"><b>{bubble.emoji}</b>{bubble.text}</p>}
      <Avatar avatar={player.avatar} />
      <strong>{player.name}{player.id === meId ? " · 나" : ""}</strong>
      <small>{isHost ? <Crown size={12} /> : player.ready ? <CheckCircle2 size={12} /> : player.waiting ? <Hourglass size={12} /> : <Circle size={12} />}{status}</small>
      {player.lastGamePending && <span className="status-badge last-next"><Star size={10} fill="currentColor" /> 다음 판 막판</span>}
      {finishedLastGame && <span className="status-badge last-done"><Star size={10} fill="currentColor" /> 막판 완료</span>}
    </div>
  );
}

function WinnerModal({ game, lobby, me, onLeave, onRematch, rematchPending, emote, onEmote, onStatus }) {
  const winners = game.players.filter((player) => game.winnerIds.includes(player.id));
  const won = game.winnerIds.includes(me?.id);
  const ranked = [...game.players].sort((a, b) => playerScore(b) - playerScore(a) || a.cards.length - b.cards.length);
  const [bubble, setBubble] = useState(null);
  useEffect(() => {
    if (!emote?.id) return undefined;
    const sender = lobby?.players.find((player) => player.id === emote.playerId);
    const item = EMOTES.find((entry) => entry.key === emote.key);
    if (!sender || !item) return undefined;
    const next = { id: emote.id, playerId: sender.id, emoji: item.emoji, text: mascotLine(sender.avatar, emote.key) };
    setBubble(next);
    const timer = setTimeout(() => setBubble((current) => current?.id === next.id ? null : current), 3_000);
    return () => clearTimeout(timer);
  }, [emote, lobby?.players]);

  const roomPlayers = lobby?.players || [];
  const isHost = lobby?.hostId === me?.id;
  const meState = roomPlayers.find((player) => player.id === me?.id);
  const guests = roomPlayers.filter((player) => player.id !== lobby?.hostId);
  const readyCount = guests.filter((player) => player.ready).length;
  const disconnected = roomPlayers.find((player) => !player.connected);
  const unresolvedLastGame = roomPlayers.find((player) => player.lastGameRoundId === lobby?.roundId);
  const allReady = guests.length > 0 && readyCount === guests.length;
  const canStart = roomPlayers.length >= 2 && allReady && !disconnected && !unresolvedLastGame && !rematchPending;
  const waitMessage = roomPlayers.length < 2
    ? "친구 한 명이 더 필요해요."
    : disconnected
      ? `${disconnected.name}님의 연결을 기다리고 있어요.`
      : unresolvedLastGame
        ? `${unresolvedLastGame.name}님이 한 판 더 할지 선택하고 있어요.`
        : allReady
          ? "모두 준비됐어요! 방장이 시작할 수 있어요."
          : `${guests.length - readyCount}명의 준비를 기다리고 있어요.`;
  const multiplayerRematch = Boolean(lobby && onStatus);
  return (
    <div className="modal-backdrop celebration"><div className="winner-modal" role="dialog" aria-modal="true" aria-label="게임 결과">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 28 }, (_, index) => <i key={index} className={`shape-${["diamond", "hexagon", "octagon", "ruby", "star"][index % 5]}`} style={{ "--x": `${(index * 37) % 100}%`, "--d": `${(index % 7) * 0.35}s`, "--t": `${2.6 + (index % 5) * 0.5}s`, "--c": ["#f6f1e7", "#2f80ed", "#27ae60", "#eb3b5a", "#f2b705"][index % 5], "--s": `${12 + (index % 4) * 5}px` }} />)}</div>
      <div className="winner-stage">{winners.map((player) => <span key={player.id}><Avatar avatar={player.avatar} size="xl" /></span>)}<div className="winner-crown">👑</div></div>
      {winners[0] && <p className="winner-says">“{mascotLine(winners[0].avatar, "win")}”</p>}
      <span>{won ? "내가 해냈어요!" : "멋진 승부였어요!"}</span>
      <h1>{winners.map((player) => player.name).join(", ")} 승리</h1>
      <p>동점일 때는 구매한 개발 카드가 더 적은 플레이어가 승리해요.</p>
      <div className="scoreboard">{ranked.map((player, index) => <div key={player.id} className={game.winnerIds.includes(player.id) ? "is-winner" : ""}><b>{index + 1}</b><Avatar avatar={player.avatar} /><span>{player.name}{player.id === me?.id ? " · 나" : ""}</span><strong>{playerScore(player)}점</strong><small>카드 {player.cards.length}장 · 귀족 {player.nobles.length}</small></div>)}</div>
      {multiplayerRematch ? <section className="rematch-room" aria-label="다음 게임 준비">
        <div className="rematch-heading"><div><span>다음 게임 준비</span><strong>{readyCount}/{guests.length}명</strong></div><p aria-live="polite">{waitMessage}</p></div>
        <div className="rematch-roster">{roomPlayers.map((player) => <RematchPlayer key={player.id} player={player} hostId={lobby.hostId} meId={me?.id} roundId={lobby.roundId} bubble={bubble?.playerId === player.id ? bubble : null} />)}</div>
        {meState?.lastGameRoundId === lobby.roundId ? <button className="primary-button one-more-choice" onClick={() => onStatus({ continuePlaying: true, ...(isHost ? {} : { ready: true }) })}><RotateCcw size={18} /> 한 판 더 할게요</button> : <div className="rematch-controls">
          {isHost ? <button className="primary-button" disabled={!canStart} onClick={onRematch}><Play size={18} fill="currentColor" /> {rematchPending ? "시작하는 중…" : canStart ? "다음 게임 시작" : "모두의 준비를 기다려요"}</button> : <button className={`primary-button ready-button ${meState?.ready ? "is-ready" : ""}`} onClick={() => onStatus({ ready: !meState?.ready })}>{meState?.ready ? <><CheckCircle2 size={18} /> 준비 취소</> : <><Circle size={18} /> 준비 완료</>}</button>}
          <button className={`last-game-toggle ${meState?.lastGamePending ? "is-active" : ""}`} onClick={() => meState?.lastGamePending ? onStatus({ lastGamePending: false }) : onEmote("last_next")}><Star size={16} fill={meState?.lastGamePending ? "currentColor" : "none"} /> {meState?.lastGamePending ? "막판 설정 취소" : "다음 판이 막판"}</button>
        </div>}
        <details className="quick-chat"><summary><MessageCircle size={16} /> 빠른 대화</summary><div>{QUICK_CHATS.map((item) => <button key={item.key} type="button" onClick={() => onEmote(item.key)}><span>{item.emoji}</span>{item.text}</button>)}</div></details>
      </section> : <>{onRematch && <button className="primary-button" onClick={onRematch}><RotateCcw size={18} /> 같은 방에서 다시하기</button>}</>}
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
  const [emote, setEmote] = useState(null);
  const demoMe = demoPlayers[0];
  const onAction = (action) => {
    try { setDemoGame((current) => applyAction(current, demoMe.id, action)); }
    catch { /* QA용 데모에서는 잘못된 동작을 그대로 무시해요. */ }
  };
  return <GameBoard game={demoGame} me={demoMe} roomCode="DEMO1" onAction={onAction} onLeave={() => { location.href = location.pathname; }} onTutorial={onTutorial} emote={emote} onEmote={(key) => setEmote({ id: Date.now(), playerId: demoMe.id, key })} />;
}

function SoloGame({ profile, difficulty, onLeave, onTutorial }) {
  const bot = useMemo(() => ({ id: `bot-${difficulty}`, name: "보석콩 BOT", avatar: "momonga", isBot: true, difficulty }), [difficulty]);
  const [game, setGame] = useState(() => createGame([profile, bot], `SOLO-${difficulty.toUpperCase()}`));
  const [error, setError] = useState("");
  const [emote, setEmote] = useState(null);
  // 봇도 가끔 감정표현에 답해줘요.
  const onEmote = (key) => {
    setEmote({ id: Date.now(), playerId: profile.id, key });
    const reply = { hello: "hello", nice: "happy", gg: "gg", sorry: "nice", hurry: "think" }[key];
    if (reply) setTimeout(() => setEmote({ id: Date.now(), playerId: bot.id, key: reply }), 900);
  };

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
  return <><GameBoard game={game} me={profile} roomCode={`SOLO · ${BOT_LEVELS[difficulty].label}`} onAction={onAction} onLeave={onLeave} onTutorial={onTutorial} onRematch={rematch} emote={emote} onEmote={onEmote} />{error && <div className="global-error"><span>{error}</span><button onClick={() => setError("")} aria-label="오류 닫기"><X size={18} /></button></div>}</>;
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
      {multiplayer.mode === "game" && multiplayer.game && <GameBoard game={multiplayer.game} lobby={multiplayer.lobby} me={multiplayer.me} roomCode={multiplayer.roomCode} onAction={multiplayer.sendAction} onLeave={multiplayer.leave} onTutorial={() => setTutorialOpen(true)} onRematch={multiplayer.isHost ? multiplayer.rematch : null} rematchPending={multiplayer.rematchPending} emote={multiplayer.emote} onEmote={multiplayer.sendEmote} onStatus={multiplayer.setStatus} />}
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
