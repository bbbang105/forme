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

/** 영상 길이(초)에 따른 분량 가이드 */
function getLengthGuide(durationSeconds: number | null): string {
  if (!durationSeconds || durationSeconds < 600) {
    // ~10분: 짧은 영상
    return `- 총 분량: 600~900자 (2분 읽기)
- 핵심 내용: 3개 bullet
- 상세 정리: 2~3개 섹션, 각 2~3문장
- 실무 인사이트: 2개`;
  }
  if (durationSeconds < 1800) {
    // 10~30분: 일반 영상
    return `- 총 분량: 900~1500자 (3~4분 읽기)
- 핵심 내용: 3~5개 bullet
- 상세 정리: 3~5개 섹션, 각 2~4문장
- 실무 인사이트: 2~3개`;
  }
  if (durationSeconds < 3600) {
    // 30~60분: 긴 영상
    return `- 총 분량: 1500~2500자 (5~7분 읽기)
- 핵심 내용: 4~6개 bullet
- 상세 정리: 5~8개 섹션, 각 3~5문장. 주요 논점과 근거를 구체적으로 포함
- 실무 인사이트: 3~4개`;
  }
  // 60분+: 매우 긴 영상
  return `- 총 분량: 2500~4000자 (8~12분 읽기)
- 핵심 내용: 5~7개 bullet
- 상세 정리: 7~12개 섹션, 각 3~6문장. 논점, 근거, 사례를 빠짐없이 포함
- 실무 인사이트: 4~5개`;
}

function buildTranscriptPrompt(durationSeconds: number | null): string {
  const guide = getLengthGuide(durationSeconds);
  const durationLabel = durationSeconds
    ? `이 영상은 약 ${Math.round(durationSeconds / 60)}분 길이입니다. 영상 길이에 비례하여 충분히 구체적으로 정리하세요.`
    : '';

  return `당신은 YouTube 영상 요약 전문가입니다.
아래 자막 텍스트를 분석하여 마크다운으로 구조화하세요.
${durationLabel}

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기 (예: 서버 컴포넌트(Server Components))
3. 불필요한 인트로/아웃트로/홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- 영상의 주요 내용을 bullet으로 정리
- 각 bullet은 1~2문장, **핵심 키워드는 볼드**
- "왜 중요한지"를 반드시 포함

### 상세 정리
영상의 흐름을 따라가며 섹션별로 정리합니다.
각 섹션은 #### 소제목 + 설명.
코드나 명령어가 언급되면 코드블록으로 표기.

### 실무 인사이트
- 이 영상에서 바로 적용할 수 있는 액션 아이템
- "~하면 ~할 수 있다" 형태의 실행 가능한 문장

### 타임라인
| 시간 | 내용 |
|------|------|
| 00:00 | 섹션 설명 |

### 키워드
\`keyword1\` \`keyword2\` \`keyword3\` (최대 7개)

## 분량 가이드
${guide}

## 주의사항
- "상세 정리" 섹션이 전체 분량의 50% 이상을 차지해야 합니다
- 타임라인은 자막의 timestamp를 기반으로 실제 시간을 추정하세요
- 자막에 타임스탬프가 없으면 타임라인 섹션을 생략하세요
- 긴 영상일수록 세부 내용과 구체적 사례를 더 많이 포함하세요`;
}

function buildDescriptionPrompt(durationSeconds: number | null): string {
  const guide = getLengthGuide(durationSeconds);
  const durationLabel = durationSeconds
    ? `이 영상은 약 ${Math.round(durationSeconds / 60)}분 길이입니다. 영상 길이에 비례하여 충분히 구체적으로 정리하세요.`
    : '';

  return `당신은 YouTube 영상 요약 전문가입니다.
아래 영상 설명을 기반으로 마크다운으로 구조화하세요.
자막이 아닌 영상 설명 기반이므로 타임라인 섹션은 생략하세요.
${durationLabel}

## 출력 규칙

1. 한국어로 작성 (원문이 영어여도 한국어로 번역)
2. 전문 용어/고유명사는 원어 병기
3. 불필요한 홍보 내용은 제거
4. 핵심만 남기되, 맥락이 끊기지 않게 작성

## summaryMarkdown 구조

### 핵심 내용
- bullet으로 정리, 각 1~2문장, **핵심 키워드 볼드**

### 상세 정리
섹션별 #### 소제목 + 설명.

### 실무 인사이트
- 바로 적용할 수 있는 액션 아이템

## 분량 가이드
${guide}`;
}

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
  durationSeconds?: number | null,
): Promise<SummaryResult> {
  if (!_genAI) _genAI = getGenAI();
  const model = _genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUMMARY_SCHEMA,
    },
    systemInstruction: source === 'transcript'
      ? buildTranscriptPrompt(durationSeconds ?? null)
      : buildDescriptionPrompt(durationSeconds ?? null),
  });

  const result = await model.generateContent(content);
  const text = result.response.text();
  return JSON.parse(text) as SummaryResult;
}
