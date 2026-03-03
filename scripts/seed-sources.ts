/**
 * 큐레이션 소스 22개 Seed 데이터
 *
 * 사용법:
 *   npx tsx scripts/seed-sources.ts
 *
 * 또는 Supabase REST API 직접 호출:
 *   환경변수 필요: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const USER_ID = 'e5154914-2a06-4a15-9ef8-53e736a30b1f';

const SOURCES = [
  // ── AI / 기술 ──
  {
    name: 'GeekNews',
    url: 'https://news.hada.io',
    rss_url: 'https://news.hada.io/rss/news',
    category: 'ai',
    tags: ['AI', 'LLM', '프론트엔드', '백엔드', '오픈소스'],
    is_active: true,
  },
  {
    name: '요즘IT 개발',
    url: 'https://yozm.wishket.com/magazine/list/develop/',
    rss_url: 'https://yozm.wishket.com/magazine/develop/feed/',
    category: 'ai',
    tags: ['프론트엔드', '백엔드', '풀스택'],
    is_active: true,
  },
  {
    name: '요즘IT AI',
    url: 'https://yozm.wishket.com/magazine/list/ai/',
    rss_url: 'https://yozm.wishket.com/magazine/ai/feed/',
    category: 'ai',
    tags: ['AI', 'LLM', '데이터 사이언스'],
    is_active: true,
  },
  {
    name: '요즘IT 디자인',
    url: 'https://yozm.wishket.com/magazine/list/design/',
    rss_url: 'https://yozm.wishket.com/magazine/design/feed/',
    category: 'uxui',
    tags: ['UX/UI', '디자인 시스템'],
    is_active: true,
  },
  {
    name: '요즘IT 커리어',
    url: 'https://yozm.wishket.com/magazine/list/career/',
    rss_url: 'https://yozm.wishket.com/magazine/career/feed/',
    category: 'career',
    tags: ['커리어 성장', '자기계발'],
    is_active: true,
  },
  {
    name: '요즘IT 트렌드',
    url: 'https://yozm.wishket.com/magazine/list/trend/',
    rss_url: 'https://yozm.wishket.com/magazine/trend/feed/',
    category: 'ai',
    tags: ['트렌드', '스타트업'],
    is_active: true,
  },
  {
    name: '요즘IT 기획',
    url: 'https://yozm.wishket.com/magazine/list/plan/',
    rss_url: 'https://yozm.wishket.com/magazine/plan/feed/',
    category: 'uxui',
    tags: ['서비스 기획', '프로덕트 매니지먼트'],
    is_active: true,
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/',
    rss_url: 'https://blog.google/technology/ai/rss/',
    category: 'ai',
    tags: ['AI', 'LLM', '데이터 사이언스'],
    is_active: true,
  },
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/blog',
    rss_url: 'https://openai.com/blog/rss.xml',
    category: 'ai',
    tags: ['AI', 'LLM'],
    is_active: true,
  },
  {
    name: 'Anthropic Research',
    url: 'https://www.anthropic.com/research',
    rss_url: 'https://www.anthropic.com/rss.xml',
    category: 'ai',
    tags: ['AI', 'LLM', '보안'],
    is_active: true,
  },
  {
    name: 'Hugging Face Blog',
    url: 'https://huggingface.co/blog',
    rss_url: 'https://huggingface.co/blog/feed.xml',
    category: 'ai',
    tags: ['AI', 'LLM', '오픈소스', '데이터 사이언스'],
    is_active: true,
  },

  // ── 프론트엔드 / 개발 ──
  {
    name: 'CSS-Tricks',
    url: 'https://css-tricks.com',
    rss_url: 'https://css-tricks.com/feed/',
    category: 'frontend',
    tags: ['프론트엔드', 'UX/UI', '디자인 시스템'],
    is_active: true,
  },
  {
    name: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com',
    rss_url: 'https://www.smashingmagazine.com/feed/',
    category: 'frontend',
    tags: ['프론트엔드', 'UX/UI', '디자인 시스템'],
    is_active: true,
  },
  {
    name: 'web.dev',
    url: 'https://web.dev',
    rss_url: 'https://web.dev/feed.xml',
    category: 'frontend',
    tags: ['프론트엔드', '테스팅', '생산성'],
    is_active: true,
  },
  {
    name: 'JavaScript Weekly',
    url: 'https://javascriptweekly.com',
    rss_url: 'https://javascriptweekly.com/rss',
    category: 'frontend',
    tags: ['프론트엔드', '풀스택'],
    is_active: true,
  },

  // ── 한국 기술 블로그 ──
  {
    name: '토스 기술 블로그',
    url: 'https://toss.tech',
    rss_url: 'https://toss.tech/rss.xml',
    category: 'techblog',
    tags: ['프론트엔드', '백엔드', '시스템 설계', '기술 블로그'],
    is_active: true,
  },
  {
    name: '카카오 기술 블로그',
    url: 'https://tech.kakao.com/blog/',
    rss_url: 'https://tech.kakao.com/blog/feed/',
    category: 'techblog',
    tags: ['백엔드', '시스템 설계', '데이터 엔지니어링', '기술 블로그'],
    is_active: true,
  },
  {
    name: '네이버 D2',
    url: 'https://d2.naver.com',
    rss_url: 'https://d2.naver.com/d2.atom',
    category: 'techblog',
    tags: ['풀스택', '시스템 설계', 'AI', '기술 블로그'],
    is_active: true,
  },
  {
    name: '우아한형제들 기술 블로그',
    url: 'https://techblog.woowahan.com',
    rss_url: 'https://techblog.woowahan.com/feed/',
    category: 'techblog',
    tags: ['백엔드', '시스템 설계', 'DevOps', '기술 블로그'],
    is_active: true,
  },
  {
    name: '당근 기술 블로그',
    url: 'https://medium.com/daangn',
    rss_url: 'https://medium.com/feed/daangn',
    category: 'techblog',
    tags: ['모바일', '백엔드', '시스템 설계', '기술 블로그'],
    is_active: true,
  },
  {
    name: 'LINE Engineering',
    url: 'https://engineering.linecorp.com/ko/blog',
    rss_url: 'https://engineering.linecorp.com/ko/feed/index.xml',
    category: 'techblog',
    tags: ['백엔드', '모바일', '보안', '기술 블로그'],
    is_active: true,
  },

  // ── UX/디자인 ──
  {
    name: 'UX Planet',
    url: 'https://uxplanet.org',
    rss_url: 'https://uxplanet.org/feed',
    category: 'uxui',
    tags: ['UX/UI', '프로덕트 매니지먼트', '디자인 시스템'],
    is_active: true,
  },
  {
    name: 'Nielsen Norman Group',
    url: 'https://www.nngroup.com/articles/',
    rss_url: 'https://www.nngroup.com/feed/rss/',
    category: 'uxui',
    tags: ['UX/UI', '프로덕트 매니지먼트', '서비스 기획'],
    is_active: true,
  },

  // ── 경제/재테크 ──
  {
    name: '뉴닉',
    url: 'https://newneek.co',
    rss_url: null,
    category: 'economy',
    tags: ['경제/재테크', '생산성'],
    is_active: true,
  },

  // ── 커리어/성장 ──
  {
    name: 'Hacker News (Best)',
    url: 'https://news.ycombinator.com',
    rss_url: 'https://hnrss.org/best',
    category: 'career',
    tags: ['스타트업', '사이드 프로젝트', '오픈소스', '커리어 성장'],
    is_active: true,
  },
  {
    name: 'DEV Community',
    url: 'https://dev.to',
    rss_url: 'https://dev.to/feed',
    category: 'career',
    tags: ['기술 블로그', '커리어 성장', '사이드 프로젝트'],
    is_active: true,
  },

  // ── 생산성/인문 ──
  {
    name: 'Todoist Blog',
    url: 'https://todoist.com/inspiration',
    rss_url: 'https://todoist.com/inspiration/feed',
    category: 'productivity',
    tags: ['생산성', '자기계발'],
    is_active: true,
  },
] as const;

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const payload = SOURCES.map((s) => ({
    user_id: USER_ID,
    name: s.name,
    url: s.url,
    rss_url: s.rss_url,
    category: s.category,
    tags: s.tags as unknown as string[],
    is_active: s.is_active,
  }));

  const response = await fetch(`${supabaseUrl}/rest/v1/curation_sources`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed: ${response.status} ${text}`);
    process.exit(1);
  }

  const inserted = await response.json();
  console.log(`Inserted ${inserted.length} sources successfully.`);
}

main();
