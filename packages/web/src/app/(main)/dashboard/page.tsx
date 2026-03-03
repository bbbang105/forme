import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Newspaper, Calendar, StickyNote, Headphones } from 'lucide-react';

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

export default function DashboardPage() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">안녕하세요!</h2>
        <p className="text-sm text-muted-foreground">
          오늘도 좋은 하루 되세요
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {features.map(({ title, description, icon: Icon, href }) => (
          <a key={href} href={href}>
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
          </a>
        ))}
      </div>
    </div>
  );
}
