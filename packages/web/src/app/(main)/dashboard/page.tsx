import Link from 'next/link';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Calendar, Headphones, Newspaper, StickyNote} from 'lucide-react';
import {DashboardCuration} from '@/components/features/curation/dashboard-curation';
import {DashboardCalendar} from '@/components/features/calendar/dashboard-calendar';
import {DashboardMemo} from '@/components/features/memo/dashboard-memo';
import {createClient} from '@/lib/supabase/server';
import {db, profiles} from '@forme/shared';
import {eq} from 'drizzle-orm';
import {getFormattedDate, getGreeting} from '@/lib/greetings';

const features = [
  {
    title: '큐레이션',
    description: 'RSS 피드 구독 & 읽기',
    icon: Newspaper,
    href: '/curation',
  },
  {
    title: '캘린더',
    description: '일정 & 할 일 관리',
    icon: Calendar,
    href: '/calendar',
  },
  {
    title: '메모',
    description: '리치 텍스트 메모장',
    icon: StickyNote,
    href: '/memo',
  },
  {
    title: '팟캐스트',
    description: 'AI 팟캐스트 플레이어',
    icon: Headphones,
    href: '/podcast',
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = '유저';
  if (user) {
    const [profile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    if (profile?.displayName) {
      displayName = profile.displayName;
    }
  }

  const greeting = getGreeting();
  const dateStr = getFormattedDate();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{dateStr}</p>
        <h2 className="text-2xl font-bold tracking-tight">안녕하세요, {displayName}님!</h2>
        <p className="text-sm text-muted-foreground">
          {greeting}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {features.map(({ title, description, icon: Icon, href }) => (
          <Link key={href} href={href}>
            <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2 p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <p className="text-xs text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Today's calendar & todos */}
      <DashboardCalendar />

      {/* Recent memos */}
      <DashboardMemo />

      {/* Latest curation items */}
      <DashboardCuration />
    </div>
  );
}
