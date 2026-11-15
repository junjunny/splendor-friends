import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Crown, Gem, LockKeyhole, Sparkles, Users, X } from "lucide-react";

const PLAYER_SETUP = {
  2: { gems: 4, nobles: 3, note: "색깔 보석을 4개씩 놓아요." },
  3: { gems: 5, nobles: 4, note: "색깔 보석을 5개씩 놓아요." },
  4: { gems: 7, nobles: 5, note: "색깔 보석을 7개씩 놓아요." },
};

const TUTORIAL_STEPS = [
  {
    label: "목표",
    title: "15점을 먼저 모으면 마지막 라운드!",
    body: "점수 카드와 귀족으로 명성 점수를 모아요. 누군가 15점에 도달해도 즉시 끝나지 않고, 모두가 같은 횟수만큼 차례를 가진 뒤 승자를 정해요.",
    bullets: ["가장 높은 점수가 승리", "동점이면 구매한 개발 카드가 더 적은 사람이 승리"],
    visual: "goal",
  },
  {
    label: "준비",
    title: "인원에 따라 보석과 귀족 수가 달라져요",
    body: "개발 카드는 언제나 1·2·3단계별로 4장씩 펼쳐요. 색깔 보석과 귀족만 참가 인원에 맞춰 준비하면 됩니다.",
    bullets: ["골드 조커는 인원과 관계없이 5개", "2–4인 모두 같은 카드 규칙 사용"],
    visual: "setup",
  },
  {
    label: "게임판",
    title: "내 차례엔 판을 위에서 아래로 읽어요",
    body: "공급처에서 보석을 확인하고, 귀족 조건과 플레이어 현황을 살핀 뒤, 시장에서 카드를 구매하거나 예약해요.",
    bullets: ["상대 점수·보석·카드도 확인 가능", "3단계가 비싸고 강하며 1단계가 엔진의 시작"],
    visual: "board",
  },
  {
    label: "보석",
    title: "한 턴에는 보석을 한 가지 방식으로 가져가요",
    body: "서로 다른 색 3개를 하나씩 가져가거나, 공급처에 4개 이상 남은 한 색을 2개 가져갈 수 있어요.",
    bullets: ["골드는 직접 가져갈 수 없음", "턴이 끝날 때 골드 포함 최대 10개 보유"],
    visual: "tokens",
  },
  {
    label: "구매",
    title: "카드는 점수이자 영구 할인권이에요",
    body: "카드 아래 비용만큼 보석을 내면 구매할 수 있어요. 구매한 카드 오른쪽 위 색상은 이후 같은 색 비용을 매번 1개씩 할인합니다.",
    bullets: ["할인은 소비되지 않고 계속 누적", "부족한 색 비용은 골드 조커로 대신 지불"],
    visual: "buy",
  },
  {
    label: "예약",
    title: "지금 못 사는 카드는 내 자리로 찜해요",
    body: "펼쳐진 카드 또는 더미 맨 위의 비공개 카드를 예약할 수 있어요. 공급처에 남아 있다면 골드 조커 1개도 함께 받아요.",
    bullets: ["예약 카드는 최대 3장", "예약도 한 턴의 행동 1개를 사용"],
    visual: "reserve",
  },
  {
    label: "귀족",
    title: "카드 보너스 조건을 채우면 귀족이 찾아와요",
    body: "귀족은 보석 토큰이 아니라 구매한 카드의 영구 보너스 개수를 봐요. 조건을 채운 턴이 끝날 때 자동으로 방문해 3점을 줍니다.",
    bullets: ["귀족 방문은 별도 행동이 아님", "여러 명이 가능하면 그중 한 명을 선택"],
    visual: "noble",
  },
  {
    label: "한 판 시작",
    title: "30초 안에 행동 하나, 차례는 시계 방향!",
    body: "보석 가져가기·카드 구매·카드 예약 중 하나를 선택하면 다음 사람의 차례예요. 제한 시간이 지나면 가능한 행동으로 자동 진행됩니다.",
    bullets: ["2·3·4인 모두 같은 순서로 진행", "처음에는 1단계 할인 카드를 고르게 모으는 것이 쉬워요"],
    visual: "turn",
  },
];

const GEM_COLORS = ["white", "blue", "green", "red", "black"];
const PLAYER_AVATARS = ["chiikawa", "hachiware", "usagi", "momonga"];

function TutorialVisual({ type, playerCount, picked, onPick }) {
  const setup = PLAYER_SETUP[playerCount];
  if (type === "goal") return (
    <div className="tutorial-goal" aria-label="15점 목표 예시">
      <span className="goal-crown"><Crown /></span><strong>15</strong><small>명성 점수</small>
      <div><span>카드 12점</span><span>귀족 3점</span></div>
    </div>
  );
  if (type === "setup") return (
    <div className="tutorial-setup" aria-label={`${playerCount}인 게임 준비`}>
      <div><Users /><strong>{playerCount}인</strong><small>{setup.note}</small></div>
      <div className="setup-gems">{GEM_COLORS.map((color) => <span key={color} className={`tutorial-gem gem-${color}`}><b>{setup.gems}</b></span>)}<span className="tutorial-gem gem-gold"><b>5</b></span></div>
      <div className="setup-nobles"><Crown /><span>귀족 <b>{setup.nobles}명</b></span></div>
    </div>
  );
  if (type === "board") return (
    <div className="tutorial-board-map" aria-label="게임판 구성">
      <div className="map-supply"><Gem /> 공급처</div><div className="map-nobles"><Crown /> 귀족</div>
      <div className="map-players"><Users /> 플레이어 현황</div>
      <div className="map-market"><span>3</span><span>2</span><span>1</span><b>개발 카드 시장</b></div>
    </div>
  );
  if (type === "tokens") {
    const complete = picked.length === 3;
    return (
      <div className="tutorial-token-practice">
        <p>{complete ? <><Check /> 좋아요! 서로 다른 보석 3개예요.</> : "보석 3개를 서로 다른 색으로 눌러보세요."}</p>
        <div>{GEM_COLORS.map((color) => <button key={color} type="button" className={`tutorial-gem gem-${color} ${picked.includes(color) ? "picked" : ""}`} aria-label={`${color} 보석`} aria-pressed={picked.includes(color)} onClick={() => onPick(color)}><span /></button>)}</div>
      </div>
    );
  }
  if (type === "buy") return (
    <div className="tutorial-buy">
      <div className="tutorial-sample-card"><span className="sample-score">1</span><span className="sample-bonus">청</span><img src="/assets/cards/generated/card-052.jpg" alt="구매 예시 먼작귀 카드" /><div><i className="cost-blue">2</i><i className="cost-red">1</i></div></div>
      <div className="buy-math"><span>파랑 2</span><b>−</b><span>파랑 할인 1</span><b>=</b><strong>토큰 1개</strong></div>
    </div>
  );
  if (type === "reserve") return (
    <div className="tutorial-reserve"><div className="reserved-card"><LockKeyhole /><b>내 예약 카드</b><small>최대 3장</small></div><span>+</span><div className="tutorial-gem gem-gold"><b>1</b></div></div>
  );
  if (type === "noble") return (
    <div className="tutorial-noble"><div><Crown /><strong>+3</strong></div><span>필요한 카드 보너스</span><p><i className="cost-blue">4</i><i className="cost-green">4</i><i className="cost-red">4</i></p><small>토큰이 아니라 구매한 카드 개수예요</small></div>
  );
  return (
    <div className="tutorial-turn-order" aria-label={`${playerCount}인 차례 순서`}>
      <div className="turn-clock">30<small>초</small></div>
      <div>{PLAYER_AVATARS.slice(0, playerCount).map((avatar, index) => <span key={avatar}><img src={`/assets/cards/${avatar}.png`} alt="" /><b>{index + 1}</b></span>)}</div>
      <p>마지막 사람 뒤에는 다시 1번 플레이어!</p>
    </div>
  );
}

export default function TutorialDialog({ onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playerCount, setPlayerCount] = useState(2);
  const [picked, setPicked] = useState([]);
  const closeRef = useRef(null);
  const step = TUTORIAL_STEPS[stepIndex];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  const pickGem = (color) => setPicked((current) => current.includes(color) ? current.filter((item) => item !== color) : current.length < 3 ? [...current, color] : [color]);
  const goTo = (index) => { setStepIndex(index); setPicked([]); };

  return (
    <div className="tutorial-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <header className="tutorial-header">
          <div className="tutorial-guide"><img src="/assets/cards/hachiware.png" alt="" /><span><b>하치와레의 보석 교실</b><small>처음이어도 8단계면 준비 완료!</small></span></div>
          <button ref={closeRef} className="tutorial-close" type="button" onClick={onClose} aria-label="튜토리얼 닫기"><X /></button>
        </header>

        <div className="tutorial-toolbar">
          <div className="tutorial-progress" aria-label={`튜토리얼 ${stepIndex + 1}/${TUTORIAL_STEPS.length}`}><span style={{ width: `${((stepIndex + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
          <div className="player-count-picker" aria-label="튜토리얼 인원 선택">{[2, 3, 4].map((count) => <button key={count} type="button" aria-pressed={playerCount === count} onClick={() => setPlayerCount(count)}>{count}인</button>)}</div>
        </div>

        <div className="tutorial-content" key={stepIndex}>
          <div className="tutorial-copy">
            <span className="tutorial-step-label"><BookOpenCheck /> {stepIndex + 1}. {step.label}</span>
            <h2 id="tutorial-title">{step.title}</h2>
            <p>{step.body}</p>
            <ul>{step.bullets.map((item) => <li key={item}><Check /> {item}</li>)}</ul>
            {stepIndex === 1 && <div className="count-note"><Sparkles /> 지금 선택한 {playerCount}인 게임은 색깔 보석 {PLAYER_SETUP[playerCount].gems}개, 귀족 {PLAYER_SETUP[playerCount].nobles}명이에요.</div>}
          </div>
          <div className={`tutorial-visual visual-${step.visual}`}><TutorialVisual type={step.visual} playerCount={playerCount} picked={picked} onPick={pickGem} /></div>
        </div>

        <footer className="tutorial-footer">
          <button type="button" className="tutorial-prev" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}><ChevronLeft /> 이전</button>
          <div className="tutorial-dots">{TUTORIAL_STEPS.map((item, index) => <button key={item.label} type="button" aria-label={`${index + 1}단계 ${item.label}`} aria-current={index === stepIndex ? "step" : undefined} onClick={() => goTo(index)} />)}</div>
          {stepIndex < TUTORIAL_STEPS.length - 1
            ? <button type="button" className="tutorial-next" onClick={() => goTo(stepIndex + 1)}>다음 <ChevronRight /></button>
            : <button type="button" className="tutorial-next finish" onClick={onClose}><Gem /> 게임 고르러 가기</button>}
        </footer>
      </section>
    </div>
  );
}

export { PLAYER_SETUP, TUTORIAL_STEPS };
