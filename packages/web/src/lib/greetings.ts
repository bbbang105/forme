/**
 * 대시보드 인사 문구
 * 디스코드 로딩 메시지 + 레딧 밈 + 개발자 유머 믹스
 */
const greetings = [
  // ── 디스코드 스타일 (자기 앱 메타 유머) ──
  'forme는 하마터면 "나만의 앱"이 될 뻔했습니다. 다행이죠?',
  '이 앱의 유일한 유저는 당신입니다. VIP시네요.',
  '사실 이 문구는 100개 중 하나입니다. 수집해보세요.',
  '이 대시보드는 새로고침할 때마다 다른 말을 합니다.',
  '이 앱을 만든 개발자는 지금 커피를 마시고 있을 확률이 87%입니다.',
  'forme의 서버 비용은 당신의 관심으로 유지됩니다.',
  '재미있는 사실: 이 문구를 쓰는 데 앱 개발보다 오래 걸렸습니다.',
  '이 앱에는 이스터에그가 숨어있습니다. 아마도. 모르겠어요.',

  // ── 개발자 밈 (실제로 웃긴 것들) ──
  'git push --force는 자신감의 표현입니다.',
  '"내 컴퓨터에서는 되는데?" — 전 세계 개발자 공통 유언',
  '// TODO: 이 주석을 지울 것 (2019년 작성)',
  'CSS는 쉽습니다. 거짓말이 더 쉽죠.',
  '오늘의 디버깅: 범인은 바로 나였다.',
  'StackOverflow가 다운되면 전 세계 GDP가 40% 하락합니다.',
  '세상에는 10종류의 사람이 있습니다. 이진법을 아는 사람과 모르는 사람.',
  '"금방 고칠게요" — 3시간 전의 나',
  'undefined is not a function. 인생도 마찬가지.',
  'localhost:3000 — 세상에서 가장 안전한 프로덕션 환경',
  '모든 버그는 의도된 기능입니다. 아직 문서화되지 않았을 뿐.',
  'rm -rf / 를 치고 싶은 하루가 있죠. 오늘은 아니길.',
  '지금 이 코드를 짠 사람과 대화하고 싶지만... 그게 나입니다.',
  'npm install 하는 동안 차 한 잔 우려도 됩니다.',
  '"이건 임시 코드야" — 3년째 프로덕션에서 돌아가는 중',
  '사실 AI가 이 문구를 썼습니다. 놀랍지 않죠?',
  'Vim에서 나가는 법을 모르면, 창을 닫으면 됩니다.',
  '이 세상 모든 merge conflict에 평화를.',
  'console.log("여기까지 옴") — 가장 정직한 디버깅',
  'docker pull 하는 동안 인생의 의미를 생각해보세요.',

  // ── 한국 인터넷 + 밈 ──
  '월요일이 아니라면, 이미 승리한 겁니다.',
  '점심 뭐 먹을지가 오늘의 가장 큰 과제.',
  '퇴근은 마음의 고향입니다.',
  '야근은 전설 속의 이야기... 가 아니라 현실.',
  '오늘도 무사히 출근한 것 자체가 업적입니다.',
  '커피 없는 아침은 404 Not Found.',
  '잠이 보약이면 우리는 전부 영양실조.',
  '할 수 있다. 아마도. 일단 커피부터.',
  '조퇴하고 싶은 마음을 코드에 담지 마세요.',
  '오늘의 컨디션: npm audit — 37 vulnerabilities found',

  // ── 명언 비틀기 + 패러디 ──
  '"Talk is cheap. Show me the code." — Linus, 오늘도 PR 기다리는 중',
  '"Stay hungry, stay foolish." — 점심 안 먹으면 진짜 hungry',
  '"Move fast and break things." — 프로덕션 DB를 break한 그날',
  '"Done is better than perfect." — Meta 사무실 벽에서 읽고 감동받은 척',
  '"First, solve the problem." — 문제가 뭔지 모르는 게 문제',
  '"Make it work, make it right, make it fast." — 1단계에서 멈춘 지 3개월',
  '"Simplicity is the ultimate sophistication." — 레오나르도, CSS를 몰랐던 사람',
  '"There are only two hard things in CS: cache invalidation and naming things."',
  '"It works on my machine." 을 docker가 해결해줬다고 믿었던 시절.',
  '"I think, therefore I am." — 데카르트가 IDE를 썼다면',

  // ── 레딧/인터넷 유머 ──
  '사실 이 앱은 당신을 위한 러브레터입니다.',
  'RAM을 다운로드하면 더 빨라집니다. 아마도.',
  'Alt+F4를 누르면 놀라운 일이 일어납니다. (누르지 마세요)',
  'AI가 세상을 지배하기 전에 할 일 목록이나 정리합시다.',
  '이 문구를 읽는 당신은 지금 약간 웃고 있습니다.',
  '인터넷 연결 상태: 양호. 인생 연결 상태: 확인 중...',
  '오늘 하루가 Windows 업데이트처럼 길지 않길.',
  '알고리즘이 당신을 여기로 이끈 게 아닙니다. 당신의 의지입니다.',
  'Ctrl+Z로 되돌릴 수 없는 유일한 것: 보낸 카톡',
  '새로고침은 현대인의 명상입니다.',
  '이 화면의 모든 픽셀이 당신을 응원합니다.',
  '404: 오늘의 걱정 Not Found',
  '500: Internal 행복 Error — 커피로 해결 가능',
  '200 OK — 당신의 하루가 이 상태코드이길',
  '브라우저 탭 47개 열어둔 당신, 진정한 멀티태스커.',
  '다크 모드는 눈을 보호합니다. 은행 잔고를 가리는 기능은 미구현.',
  '이 앱은 쿠키를 사용하지 않습니다. 진짜 쿠키를 드세요.',

  // ── 은근 감동 + 진심 ──
  '작은 진전도 git log에는 남습니다.',
  '어제보다 한 줄이라도 더 나아갔다면, 그게 성장입니다.',
  '완벽한 코드는 없지만, 완벽한 하루를 만들 순 있어요.',
  '당신이 만든 것들이 누군가의 하루를 바꿀 수 있어요.',
  '쉬는 것도 배포의 일부입니다.',
  '급하지 않아도 괜찮아요. 당신의 속도가 정답이에요.',
  'main 브랜치처럼 안정적인 하루 되세요.',
  '오늘도 커밋 하나의 가치가 있는 하루.',
  '세상에서 제일 중요한 프로젝트는 당신 자신입니다.',
  '버그 없는 하루를 보내세요. 인생에서요.',

  // ── 한 줄 위트 ──
  '로딩 중... 당신의 잠재력',
  'sudo make me happy',
  'pip install motivation',
  'brew install good-vibes',
  'cargo build --release (오늘의 에너지)',
  'SELECT * FROM today WHERE mood = "good"',
  'while(alive) { eat(); sleep(); code(); }',
  'try { 오늘_하루() } catch { 내일_다시() }',
  'if (tired) { coffee++ }',
  'return "좋은 하루"',
] as const;

/** KST 기준 현재 날짜 */
function getKSTDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

/**
 * 오늘 날짜(KST) 기반으로 일관된 랜덤 인사 반환
 * (같은 날 새로고침해도 같은 메시지)
 */
export function getGreeting(): string {
  const today = getKSTDate();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return greetings[seed % greetings.length];
}

/**
 * 오늘 날짜(KST)를 'YYYY년 M월 D일' 형식으로 반환
 */
export function getFormattedDate(): string {
  const now = getKSTDate();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}
