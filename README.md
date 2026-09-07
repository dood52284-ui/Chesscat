# ♟ CHESS

GitHub Pages용 모바일 체스 웹앱입니다.

## 주요 기능
- 사람 vs AI / 사람 vs 사람 / AI vs AI를 게임 화면에서 즉시 전환
- Stockfish 19 WebAssembly를 우선 사용
- AI 강도를 별도 난이도가 아니라 탐색 깊이(Depth)로 설정
- Stockfish 연결 지연/실패 시 내장 AI로 자동 전환
- 수 기록 클릭으로 해당 위치 복기
- 평가 그래프, 후보 수, 주요 변형(PV)
- 오프닝 도감 26종 + 검색/스타일 필터
- 게임 기록/통계 브라우저 저장
- 반응형 PC/모바일 UI

## 파일
- `index.html`
- `style.css`
- `app.js`
- `stockfish.js`

## 엔진
`stockfish.js`는 `@lichess-org/stockfish-web`의 Stockfish 19 WebAssembly 모듈과 NNUE를 불러오는 브리지입니다. GitHub Pages에서 인터넷 연결이 필요합니다.

## 사용
저장소 최상위에 위 파일을 올린 뒤 GitHub Pages를 `main / root`로 설정하면 됩니다.
