// packages/web/src/lib/gemini.ts
import {GoogleGenerativeAI, SchemaType} from '@google/generative-ai';

const SUMMARY_SCHEMA = {
  type: SchemaType.OBJECT as const,
  properties: {
    oneLiner: { type: SchemaType.STRING as const, description: '한줄 요약' },
    keywords: {
      type: SchemaType.ARRAY as const,
      items: { type: SchemaType.STRING as const },
      description: '키워드 (최대 7개)',
    },
    summaryMarkdown: { type: SchemaType.STRING as const, description: '마크다운 요약 전문' },
  },
  required: ['oneLiner', 'keywords', 'summaryMarkdown'],
};

const TRANSCRIPT_SYSTEM_PROMPT = `당신은 YouTube 영상 요약 전문가입니다.
아래 자막 텍스트를 분석하여 **3분 안에 읽고 핵심을 파악할 수 있도록** 마크다운으로 구조화하세요.

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기 (예: 서버 컴포넌트(Server Components))
3. 불필요한 인트로/아웃트로/홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- 영상의 주요 내용을 3~5개 bullet으로 정리
- 각 bullet은 1~2문장, **핵심 키워드는 볼드**
- "왜 중요한지"를 반드시 포함

### 상세 정리
영상의 흐름을 따라가며 섹션별로 정리합니다.
각 섹션은 #### 소제목 + 2~4문장 설명.
코드나 명령어가 언급되면 코드블록으로 표기.

### 실무 인사이트
- 이 영상에서 바로 적용할 수 있는 액션 아이템 2~3개
- "~하면 ~할 수 있다" 형태의 실행 가능한 문장

### 타임라인
| 시간 | 내용 |
|------|------|
| 00:00 | 섹션 설명 |

### 키워드
\`keyword1\` \`keyword2\` \`keyword3\` (최대 7개)

## 주의사항
- "상세 정리" 섹션이 전체 분량의 50% 이상을 차지해야 합니다
- 타임라인은 자막의 timestamp를 기반으로 실제 시간을 추정하세요
- 자막에 타임스탬프가 없으면 타임라인 섹션을 생략하세요
- 총 분량: 800~1200자 내외 (3분 읽기 기준)`;

const DESCRIPTION_SYSTEM_PROMPT = `당신은 YouTube 영상 요약 전문가입니다.
아래 영상 설명을 기반으로 **3분 안에 읽고 핵심을 파악할 수 있도록** 마크다운으로 구조화하세요.
자막이 아닌 영상 설명 기반이므로 타임라인 섹션은 생략하세요.

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기
3. 불필요한 홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- 3~5개 bullet, 각 1~2문장, **핵심 키워드 볼드**

### 상세 정리
섹션별 #### 소제목 + 2~4문장 설명.

### 실무 인사이트
- 바로 적용할 수 있는 액션 아이템 2~3개`;

export interface SummaryResult {
  oneLiner: string;
  keywords: string[];
  summaryMarkdown: string;
}

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다');
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

let _genAI: GoogleGenerativeAI | null = null;

export async function summarizeVideo(
  content: string,
  source: 'transcript' | 'description',
): Promise<SummaryResult> {
  if (!_genAI) _genAI = getGenAI();
  const model = _genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_SCHEMA,
    },
    systemInstruction: source === 'transcript'
      ? TRANSCRIPT_SYSTEM_PROMPT
      : DESCRIPTION_SYSTEM_PROMPT,
  });

  const result = await model.generateContent(content);
  const text = result.response.text();
  return JSON.parse(text) as SummaryResult;
}
