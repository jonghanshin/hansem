export const MENU = [
  {
    href: "/consult",
    label: "고객상담",
    description: "상담노트 작성, 연락·미팅·실측 일정과 후속 할 일 관리",
  },
  {
    href: "/as",
    label: "A/S관리",
    description: "현장 검색으로 A/S 접수, 방문·처리 이력, 완료·고객 확인, 비용·사진 관리",
  },
  {
    href: "/sites",
    label: "현장정보",
    description: "현장 목록 조회, 신규 입력, 엑셀 업로드, 상세 수정",
  },
  {
    href: "/deposits",
    label: "입금내역",
    description: "전체 현장의 입금·출금 내역 조회",
  },
  {
    href: "/board",
    label: "게시판",
    description: "글 쓰기·조회, 파일 첨부",
  },
  {
    href: "/calendar",
    label: "팀 캘린더",
    description: "월별 일정 등록, 팀원 일정 함께 보기",
  },
  {
    href: "/knowledge",
    label: "지식자산",
    description: "공정별거래처·타공정거래처·공정표 조회 및 수정",
  },
] as const;

/** 관리자 이상(CEO·관리자·슈퍼관리자)에게만 보이는 메뉴. 화면에서도 권한을 다시 확인한다 */
export const MANAGER_MENU = [
  {
    href: "/settlement",
    label: "정산",
    description: "영업사원·정산월별 미정산 현장을 골라 현장별 입금·출금 정산",
  },
] as const;

/** 슈퍼관리자에게만 보이는 메뉴. 화면에서도 권한을 다시 확인한다 */
export const ADMIN_MENU = [
  {
    href: "/dashboard",
    label: "대시보드",
    description: "진행 중인 전체 현장의 계약금·입금·출금 (시공비·한샘·홈씨씨별)",
  },
] as const;
