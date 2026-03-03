import { readFileSync } from 'fs';

// Parse .env.local manually
const envContent = readFileSync('./packages/web/.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const USER_ID = 'e5154914-2a06-4a15-9ef8-53e736a30b1f';

const SOURCES = [
  { name: 'GeekNews', url: 'https://news.hada.io', rss_url: 'https://news.hada.io/rss/news', category: 'ai', tags: '{AI,LLM,프론트엔드,백엔드,오픈소스}' },
  { name: '요즘IT', url: 'https://yozm.wishket.com/magazine/list/develop/', rss_url: 'https://yozm.wishket.com/magazine/feed/', category: 'ai', tags: '{프론트엔드,백엔드,커리어 성장}' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/', rss_url: 'https://blog.google/technology/ai/rss/', category: 'ai', tags: '{AI,LLM,데이터 사이언스}' },
  { name: 'OpenAI Blog', url: 'https://openai.com/blog', rss_url: 'https://openai.com/blog/rss.xml', category: 'ai', tags: '{AI,LLM}' },
  { name: 'Anthropic Research', url: 'https://www.anthropic.com/research', rss_url: 'https://www.anthropic.com/rss.xml', category: 'ai', tags: '{AI,LLM,보안}' },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog', rss_url: 'https://huggingface.co/blog/feed.xml', category: 'ai', tags: '{AI,LLM,오픈소스,데이터 사이언스}' },
  { name: 'CSS-Tricks', url: 'https://css-tricks.com', rss_url: 'https://css-tricks.com/feed/', category: 'frontend', tags: '{프론트엔드,UX/UI,디자인 시스템}' },
  { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com', rss_url: 'https://www.smashingmagazine.com/feed/', category: 'frontend', tags: '{프론트엔드,UX/UI,디자인 시스템}' },
  { name: 'web.dev', url: 'https://web.dev', rss_url: 'https://web.dev/feed.xml', category: 'frontend', tags: '{프론트엔드,테스팅,생산성}' },
  { name: 'JavaScript Weekly', url: 'https://javascriptweekly.com', rss_url: 'https://javascriptweekly.com/rss', category: 'frontend', tags: '{프론트엔드,풀스택}' },
  { name: '토스 기술 블로그', url: 'https://toss.tech', rss_url: 'https://toss.tech/rss.xml', category: 'techblog', tags: '{프론트엔드,백엔드,시스템 설계,기술 블로그}' },
  { name: '카카오 기술 블로그', url: 'https://tech.kakao.com/blog/', rss_url: 'https://tech.kakao.com/blog/feed/', category: 'techblog', tags: '{백엔드,시스템 설계,데이터 엔지니어링,기술 블로그}' },
  { name: '네이버 D2', url: 'https://d2.naver.com', rss_url: 'https://d2.naver.com/d2.atom', category: 'techblog', tags: '{풀스택,시스템 설계,AI,기술 블로그}' },
  { name: '우아한형제들 기술 블로그', url: 'https://techblog.woowahan.com', rss_url: 'https://techblog.woowahan.com/feed/', category: 'techblog', tags: '{백엔드,시스템 설계,DevOps,기술 블로그}' },
  { name: '당근 기술 블로그', url: 'https://medium.com/daangn', rss_url: 'https://medium.com/feed/daangn', category: 'techblog', tags: '{모바일,백엔드,시스템 설계,기술 블로그}' },
  { name: 'LINE Engineering', url: 'https://engineering.linecorp.com/ko/blog', rss_url: 'https://engineering.linecorp.com/ko/feed/index.xml', category: 'techblog', tags: '{백엔드,모바일,보안,기술 블로그}' },
  { name: 'UX Planet', url: 'https://uxplanet.org', rss_url: 'https://uxplanet.org/feed', category: 'uxui', tags: '{UX/UI,프로덕트 매니지먼트,디자인 시스템}' },
  { name: 'Nielsen Norman Group', url: 'https://www.nngroup.com/articles/', rss_url: 'https://www.nngroup.com/feed/rss/', category: 'uxui', tags: '{UX/UI,프로덕트 매니지먼트,서비스 기획}' },
  { name: '뉴닉', url: 'https://newneek.co', rss_url: null, category: 'economy', tags: '{경제/재테크,생산성}' },
  { name: 'Hacker News (Best)', url: 'https://news.ycombinator.com', rss_url: 'https://hnrss.org/best', category: 'career', tags: '{스타트업,사이드 프로젝트,오픈소스,커리어 성장}' },
  { name: 'DEV Community', url: 'https://dev.to', rss_url: 'https://dev.to/feed', category: 'career', tags: '{기술 블로그,커리어 성장,사이드 프로젝트}' },
  { name: 'Todoist Blog', url: 'https://todoist.com/inspiration', rss_url: 'https://todoist.com/inspiration/feed', category: 'productivity', tags: '{생산성,자기계발}' },
];

const payload = SOURCES.map(s => ({
  user_id: USER_ID,
  name: s.name,
  url: s.url,
  rss_url: s.rss_url,
  category: s.category,
  tags: s.tags,
  is_active: true,
}));

const response = await fetch(`${SUPABASE_URL}/rest/v1/curation_sources`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  console.error('Failed:', response.status, await response.text());
  process.exit(1);
}

const data = await response.json();
console.log(`Inserted ${data.length} sources`);
