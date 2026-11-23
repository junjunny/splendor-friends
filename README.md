# 보석친구 · 스플렌더 팬게임

먼작귀 카드 일러스트와 귀여운 보석 토큰으로 즐기는 비상업 팬메이드 스플렌더 스타일 보드게임입니다.

## 포함 기능

- 2–4인 권위 서버 기반 온라인 멀티플레이
- Upstash Redis에 방과 게임을 12시간 보존해 방장 이탈·앱 전환·페이지 재로딩 뒤에도 자동 복구
- 서버 동시성 제어와 행동 식별자로 중복 탭·동시 요청을 한 번만 반영
- 1인 플레이: 초급·중급·고급·레전더리 봇
- 처음 하는 사람을 위한 8단계 인터랙티브 튜토리얼과 2·3·4인 준비 안내
- 공식 스플렌더 카드 구성과 인원별 토큰·귀족 세팅
- 30초 턴 제한 및 시간 초과 자동 진행
- 모바일·태블릿·데스크톱 반응형 게임판과 플레이어 패널
- 90장 고유 카드 일러스트와 잘림 없는 중앙 정렬

## 실행

```bash
npm install
npm run dev
```

테스트와 프로덕션 빌드는 다음 명령으로 확인할 수 있습니다.

```bash
npm test
npm run audit:art
npm run test:e2e
npm run build
```

`audit:art`는 90장 이미지의 파일 누락·중복 해시·해상도를 검사합니다. `test:e2e`는 모바일·태블릿·데스크톱에서 튜토리얼, 카드 표시, 가로 넘침, 접근성을 확인합니다.

배포 환경에는 Vercel Marketplace의 Upstash Redis가 필요합니다. 연결된 `KV_REST_API_URL`, `KV_REST_API_TOKEN`은 Vercel이 자동으로 주입합니다. 로컬 `npm run dev`와 `npm run preview`는 같은 서버 계약을 사용하는 메모리 저장소로 동작합니다.

실제 배포: [splendor-friends.vercel.app](https://splendor-friends.vercel.app)

> 본 프로젝트는 비상업 팬메이드 프로젝트입니다. 카드 일러스트는 먼작귀 팬아트 자산을 사용합니다.
