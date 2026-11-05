import { MenuNav } from "./menu-nav";

// 현장정보 / 입금내역 화면이 공유하는 레이아웃 (상단 메뉴 바)
// 모바일(lg 미만)은 페이지 전체가 스크롤되고, 넓은 화면은 높이를 고정하고 목록 영역만 스크롤한다.
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <MenuNav />
      {children}
    </div>
  );
}
