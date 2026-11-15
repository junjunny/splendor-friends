import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Clock3, Crown, Gem, LockKeyhole, RotateCcw, Sparkles, Users, X } from "lucide-react";
import { COLORS, COLOR_META } from "./game.js";
import "./tutorial.css";

const PLAYER_SETUP = {
  2: { gems: 4, nobles: 3, note: "색깔 보석을 4개씩 놓아요." },
  3: { gems: 5, nobles: 4, note: "색깔 보석을 5개씩 놓아요." },
  4: { gems: 7, nobles: 5, note: "색깔 보석을 7개씩 놓아요." },
};

// says: 안내 친구가 말풍선으로 한 줄 건네요. 본문은 짧은 문장 위주로, 어려운 말은 쓰지 않아요.
const TUTORIAL_STEPS = [
  {
    label: "목표", guide: "hachiware", name: "하치와레", tint: "#d9efff",
    says: "안녕! 나는 하치와레야. 같이 보석 모으기 게임을 배워보자!",
    title: "먼저 15점을 모으면 이겨요!",
    body: "카드와 귀족에게서 점수를 모아요. 누가 15점이 되면, 그 라운드가 끝날 때까지 모두 한 번씩 더 해요.",
    bullets: ["점수가 가장 높은 친구가 승리!", "점수가 같으면 카드를 더 적게 산 친구가 승리"],
    visual: "goal",
  },
  {
    label: "준비", guide: "usagi", name: "우사기", tint: "#fff0b8",
    says: "우라! 먼저 보석부터 꺼내야 해. 인원에 따라 개수가 달라져!",
    title: "보석과 귀족을 꺼내요",
    body: "카드는 언제나 1·2·3단계 줄마다 4장씩 펼쳐요. 색깔 보석과 귀족만 인원수에 맞춰 놓으면 돼요.",
    bullets: ["금색 조커 보석은 언제나 5개", "2·3·4인 모두 규칙은 똑같아요"],
    visual: "setup",
  },
  {
    label: "게임판", guide: "momonga", name: "모몽가", tint: "#eee2ff",
    says: "후후, 판은 위에서 아래로 읽으면 쉬워. 따라와봐!",
    title: "게임판을 구경해요",
    body: "위쪽엔 보석 공급처와 귀족 광장, 가운데엔 카드 시장, 옆(또는 아래)엔 친구들 현황이 있어요.",
    bullets: ["친구가 가진 보석·카드·점수는 언제든 볼 수 있어요", "아래 단계일수록 싸고, 위 단계일수록 비싸지만 점수가 높아요"],
    visual: "board",
  },
  {
    label: "보석", guide: "chiikawa", name: "치이카와", tint: "#ffe2e9",
    says: "으응! 직접 눌러보면서 해보자. 보석을 가져가는 방법은 두 가지야!",
    title: "내 차례엔 보석을 가져가요",
    body: "아래에서 방법을 고르고, 보석을 눌러 연습해 보세요. 한 번에 한 가지 방법만 쓸 수 있어요.",
    bullets: ["금색 조커는 직접 못 가져가요 (카드를 예약하면 받아요)", "내 차례가 끝날 때 보석은 모두 합쳐 10개까지만 가질 수 있어요"],
    visual: "tokens",
  },
  {
    label: "구매", guide: "kurimanju", name: "쿠리만쥬", tint: "#f1ddc8",
    says: "카드를 사면 점수도 받고, 평생 할인도 받아! 완전 이득이야.",
    title: "카드는 점수이자 평생 할인권",
    body: "카드에 적힌 보석을 내면 살 수 있어요. 산 카드의 색깔은 다음부터 그 색 비용을 1개씩 깎아줘요.",
    bullets: ["깎인 만큼은 보석을 안 내도 돼요. 할인은 계속 남아요!", "모자란 색은 금색 조커로 대신 낼 수 있어요"],
    visual: "buy",
  },
  {
    label: "예약", guide: "rakko", name: "라쿠", tint: "#ffe9c9",
    says: "당장 못 사는 카드는 내 자리에 찜해두면 돼. 아무도 못 가져가!",
    title: "카드를 예약해요",
    body: "펼쳐진 카드나 더미 맨 위 카드를 내 자리로 가져와요. 조커가 남아 있으면 1개도 같이 받아요.",
    bullets: ["예약 카드는 최대 3장까지", "더미에서 뽑은 카드는 나만 볼 수 있어요", "예약도 내 차례의 행동 1번이에요"],
    visual: "reserve",
  },
  {
    label: "귀족", guide: "ode", name: "오데", tint: "#fff3a8",
    says: "귀족님이 찾아오면 점수가 3점이나 올라가! 한번 불러볼래?",
    title: "카드를 모으면 귀족이 찾아와요",
    body: "귀족은 보석이 아니라, 내가 산 카드의 개수를 봐요. 조건을 채운 차례가 끝나면 저절로 찾아와서 3점을 줘요.",
    bullets: ["귀족은 따로 행동하지 않아도 와요", "한 번에 여러 명이 올 수 있으면 한 명을 골라요"],
    visual: "noble",
  },
  {
    label: "한 판 시작", guide: "hachiware", name: "하치와레", tint: "#d9efff",
    says: "다 배웠어! 이제 진짜 한 판 해보자. 처음엔 1단계 카드부터 모아봐~",
    title: "30초 안에 행동 하나!",
    body: "내 차례엔 아래 세 가지 중 딱 하나만 해요. 시간이 다 되면 대신 알아서 해줘요.",
    bullets: ["차례는 순서대로 계속 돌아가요", "처음엔 싼 카드로 할인을 모으는 게 쉬워요"],
    visual: "turn",
  },
];

const AVATARS = ["chiikawa", "hachiware", "usagi", "momonga"];

function Gem3D({ color, count, picked = 0, onClick, label }) {
  const meta = COLOR_META[color];
  const content = (
    <>
      <span className={`tut-gem shape-${meta.shape}`} style={{ "--gem": meta.hex }}><i /></span>
      {count !== undefined && <b className="tut-gem-count">{count}</b>}
      {picked > 0 && <em className="tut-gem-picked">+{picked}</em>}
      <small>{label || meta.label}</small>
    </>
  );
  return onClick
    ? <button type="button" className={`tut-gem-btn ${picked ? "is-picked" : ""}`} onClick={onClick} aria-label={`${meta.label} 보석`} aria-pressed={picked > 0}>{content}</button>
    : <span className="tut-gem-btn">{content}</span>;
}

function CostChip({ color, count }) {
  return <span className={`tut-chip tut-chip-${color}`} aria-label={`${COLOR_META[color].label} ${count}개`}>{count}</span>;
}

function TokenPractice({ mode, setMode, picked, setPicked }) {
  const three = mode === "three";
  const choose = (color) => setPicked((current) => {
    if (!three) return current[0] === color ? [] : [color, color];
    if (current.length >= 3) return [color];
    return current.includes(color) ? current.filter((item) => item !== color) : [...current, color];
  });
  const done = three ? picked.length === 3 : picked.length === 2;
  const message = done
    ? three ? "좋아요! 서로 다른 보석 3개를 가져갔어요." : "좋아요! 같은 색 보석 2개를 가져갔어요."
    : three ? `서로 다른 색을 3개 눌러보세요. (${picked.length}/3)` : "가져갈 색을 하나 눌러보세요. 같은 색이 2개 담겨요.";
  return (
    <div className="tut-practice">
      <div className="tut-segment" role="group" aria-label="보석 가져가는 방법">
        <button type="button" aria-pressed={three} onClick={() => { setMode("three"); setPicked([]); }}>서로 다른 3개</button>
        <button type="button" aria-pressed={!three} onClick={() => { setMode("two"); setPicked([]); }}>같은 색 2개</button>
      </div>
      <div className="tut-gem-row">
        {COLORS.map((color) => <Gem3D key={color} color={color} count={three ? undefined : 4} picked={picked.filter((item) => item === color).length} onClick={() => choose(color)} />)}
      </div>
      <p className={`tut-feedback ${done ? "ok" : ""}`} role="status">{done && <Check size={16} />} {message}</p>
      {!three && <p className="tut-hint">같은 색 2개는 그 색이 공급처에 <b>4개 이상</b> 남아 있을 때만 가능해요.</p>}
    </div>
  );
}

function BuyPractice({ discount, setDiscount }) {
  const pay = discount ? ["blue", "red"] : ["blue", "blue", "red"];
  return (
    <div className="tut-buy">
      <div className="tut-sample">
        <div className="tut-sample-art"><img src="/assets/cards/generated/card-052.jpg" alt="구매 예시 카드 일러스트" /></div>
        <span className="tut-sample-score">1</span>
        <span className="tut-sample-bonus shape-hexagon" aria-label="파랑 보석 할인 카드" />
        <div className="tut-sample-cost"><CostChip color="blue" count={2} /><CostChip color="red" count={1} /></div>
        <span className="tut-callout c1">점수</span>
        <span className="tut-callout c2">할인되는 색</span>
        <span className="tut-callout c3">필요한 보석</span>
      </div>
      <div className="tut-calc">
        <div className="tut-segment" role="group" aria-label="내가 가진 카드 고르기">
          <button type="button" aria-pressed={!discount} onClick={() => setDiscount(false)}>카드 없음</button>
          <button type="button" aria-pressed={discount} onClick={() => setDiscount(true)}>파랑 카드 1장 있음</button>
        </div>
        <div className="tut-pay" aria-live="polite">
          <small>내야 하는 보석</small>
          <div>{pay.map((color, index) => <span key={`${color}${index}`} className={`tut-gem shape-${COLOR_META[color].shape}`} style={{ "--gem": COLOR_META[color].hex }}><i /></span>)}<b>= {pay.length}개</b></div>
          <p>{discount ? "파랑 카드가 파랑 1개를 대신 내줘요! 😊" : "카드가 없으면 비용 그대로 내요."}</p>
        </div>
      </div>
    </div>
  );
}

function NoblePractice({ cards, setCards }) {
  const arrived = cards.blue >= 4 && cards.green >= 4;
  const add = (color) => setCards((current) => ({ ...current, [color]: Math.min(4, current[color] + 1) }));
  return (
    <div className="tut-noble">
      <div className={`tut-noble-card ${arrived ? "arrived" : ""}`}>
        <Crown size={30} /><strong>+3점</strong>
        <small>필요한 카드</small>
        <div><CostChip color="blue" count={4} /><CostChip color="green" count={4} /></div>
      </div>
      <div className="tut-noble-mine">
        <small>내가 산 카드</small>
        <div className="tut-noble-counts"><span>파랑 <b>{cards.blue}/4</b></span><span>초록 <b>{cards.green}/4</b></span></div>
        <div className="tut-noble-buttons">
          <button type="button" className="blue" disabled={cards.blue >= 4} onClick={() => add("blue")}>파랑 카드 사기</button>
          <button type="button" className="green" disabled={cards.green >= 4} onClick={() => add("green")}>초록 카드 사기</button>
        </div>
        <p className={`tut-feedback ${arrived ? "ok" : ""}`} role="status">{arrived ? "귀족님이 찾아왔어요! 3점 획득 🎉" : "카드를 4장씩 모아보세요."}</p>
        {(cards.blue > 0 || cards.green > 0) && <button type="button" className="tut-reset" onClick={() => setCards({ blue: 0, green: 0 })}><RotateCcw size={14} /> 다시 해보기</button>}
      </div>
    </div>
  );
}

function TutorialVisual({ type, playerCount, state }) {
  const setup = PLAYER_SETUP[playerCount];
  if (type === "goal") return (
    <div className="tut-goal" role="img" aria-label="15점 목표">
      <span className="tut-goal-crown"><Crown /></span><strong>15</strong><small>점</small>
      <div><span>카드 점수</span><b>+</b><span>귀족 3점</span></div>
    </div>
  );
  if (type === "setup") return (
    <div className="tut-setup" aria-label={`${playerCount}인 게임 준비`}>
      <div className="tut-setup-head"><Users /><strong>{playerCount}인 게임</strong><small>{setup.note}</small></div>
      <div className="tut-gem-row small">
        {COLORS.map((color) => <Gem3D key={color} color={color} count={setup.gems} />)}
        <Gem3D color="gold" count={5} label="금색 조커" />
      </div>
      <div className="tut-setup-nobles"><Crown /> 귀족 <b>{setup.nobles}명</b> 펼치기</div>
    </div>
  );
  if (type === "board") return (
    <div className="tut-board" role="img" aria-label="게임판 구성">
      <div className="b1"><Gem /> 보석 공급처</div>
      <div className="b2"><Crown /> 귀족 광장</div>
      <div className="b3"><span className="t3">3</span><span className="t2">2</span><span className="t1">1</span><b>카드 시장</b></div>
      <div className="b4"><Users /> 친구들 현황</div>
    </div>
  );
  if (type === "tokens") return <TokenPractice {...state.tokens} />;
  if (type === "buy") return <BuyPractice {...state.buy} />;
  if (type === "reserve") return (
    <div className="tut-reserve">
      <div className="tut-reserve-card"><LockKeyhole /><b>내 예약 카드</b><small>최대 3장</small></div>
      <span className="tut-plus">+</span>
      <Gem3D color="gold" count={1} label="조커 1개" />
    </div>
  );
  if (type === "noble") return <NoblePractice {...state.noble} />;
  return (
    <div className="tut-turn">
      <div className="tut-clock"><Clock3 size={20} />30<small>초</small></div>
      <div className="tut-actions" aria-label="내 차례에 할 수 있는 행동">
        <span><Gem size={18} /> 보석 가져가기</span><span><Sparkles size={18} /> 카드 사기</span><span><LockKeyhole size={18} /> 카드 예약</span>
      </div>
      <div className="tut-order">{AVATARS.slice(0, playerCount).map((avatar, index) => <span key={avatar}><img src={`/assets/cards/${avatar}.png`} alt="" /><b>{index + 1}</b></span>)}</div>
      <p>마지막 친구 다음엔 다시 1번 친구 차례예요.</p>
    </div>
  );
}

export default function TutorialDialog({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playerCount, setPlayerCount] = useState(2);
  const [tokenMode, setTokenMode] = useState("three");
  const [picked, setPicked] = useState([]);
  const [discount, setDiscount] = useState(false);
  const [nobleCards, setNobleCards] = useState({ blue: 0, green: 0 });
  const closeRef = useRef(null);
  const contentRef = useRef(null);
  const touchRef = useRef(null);
  const step = TUTORIAL_STEPS[stepIndex];
  const last = stepIndex === TUTORIAL_STEPS.length - 1;

  const goTo = (index) => {
    const next = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, index));
    setStepIndex(next);
    setPicked([]); setTokenMode("three"); setDiscount(false); setNobleCards({ blue: 0, green: 0 });
    contentRef.current?.scrollTo?.({ top: 0 });
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") goTo(stepIndex + 1);
      if (event.key === "ArrowLeft") goTo(stepIndex - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, stepIndex]);

  // 손가락으로 옆으로 밀어서 넘길 수도 있어요.
  const onTouchStart = (event) => { const touch = event.touches[0]; touchRef.current = { x: touch.clientX, y: touch.clientY }; };
  const onTouchEnd = (event) => {
    const start = touchRef.current; touchRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x; const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) goTo(stepIndex + (dx < 0 ? 1 : -1));
  };

  const state = {
    tokens: { mode: tokenMode, setMode: setTokenMode, picked, setPicked },
    buy: { discount, setDiscount },
    noble: { cards: nobleCards, setCards: setNobleCards },
  };

  return (
    <div className="tut-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="tut-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <header className="tut-header">
          <div className="tut-brand"><b>보석 교실</b><small>{stepIndex + 1} / {TUTORIAL_STEPS.length}</small></div>
          <div className="player-count-picker" aria-label="튜토리얼 인원 선택">{[2, 3, 4].map((count) => <button key={count} type="button" aria-pressed={playerCount === count} onClick={() => setPlayerCount(count)}>{count}인</button>)}</div>
          <button ref={closeRef} className="tut-close" type="button" onClick={onClose} aria-label="튜토리얼 닫기"><X /></button>
          <div className="tut-progress" role="progressbar" aria-label="튜토리얼 진행도" aria-valuemin={1} aria-valuemax={TUTORIAL_STEPS.length} aria-valuenow={stepIndex + 1}><span style={{ width: `${((stepIndex + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
        </header>

        <div className="tut-content" key={stepIndex} ref={contentRef} tabIndex={0} role="region" aria-label="튜토리얼 내용" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className="tut-copy">
            <div className="tut-says" style={{ "--says": step.tint }}>
              <img src={`/assets/cards/${step.guide}.png`} alt={step.name} />
              <p><b>{step.name}</b>{step.says}</p>
            </div>
            <span className="tut-label"><BookOpenCheck /> {stepIndex + 1}. {step.label}</span>
            <h2 id="tutorial-title">{step.title}</h2>
            <p className="tut-body">{step.body}</p>
          </div>
          <div className={`tut-visual visual-${step.visual}`}><TutorialVisual type={step.visual} playerCount={playerCount} state={state} /></div>
          <div className="tut-tips">
            <ul>{step.bullets.map((item) => <li key={item}><Check /> {item}</li>)}</ul>
            {stepIndex === 1 && <div className="count-note"><Sparkles /> 지금 고른 {playerCount}인 게임은 색깔 보석 {PLAYER_SETUP[playerCount].gems}개, 귀족 {PLAYER_SETUP[playerCount].nobles}명이에요.</div>}
          </div>
        </div>

        <footer className="tut-footer">
          <button type="button" className="tut-prev" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}><ChevronLeft /> 이전</button>
          <div className="tut-dots">{TUTORIAL_STEPS.map((item, index) => <button key={item.label} type="button" aria-label={`${index + 1}단계 ${item.label}`} aria-current={index === stepIndex ? "step" : undefined} onClick={() => goTo(index)} />)}</div>
          {!last
            ? <button type="button" className="tut-next" onClick={() => goTo(stepIndex + 1)}>다음 <ChevronRight /></button>
            : <button type="button" className="tut-next finish" onClick={onClose}><Gem /> 게임하러 가기</button>}
        </footer>
      </section>
    </div>
  );
}

export { PLAYER_SETUP, TUTORIAL_STEPS };
