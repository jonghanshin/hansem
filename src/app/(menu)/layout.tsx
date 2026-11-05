import { MenuNav } from "./menu-nav";

// 현장정보 / 입금내역 화면이 공유하는 레이아웃 (상단 메뉴 바)
export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <MenuNav />
      {children}
    </div>
  );
}
