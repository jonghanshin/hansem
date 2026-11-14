"use server";

import { refresh } from "next/cache";

import { getSession } from "@/lib/auth";
import { readAllNotices } from "@/lib/notices";

/** 내 알림 모두 읽음 */
export async function readAllNoticesAction(): Promise<void> {
  const session = await getSession();
  if (!session || session.mustChangePassword) return;
  await readAllNotices(session.uid);
  refresh();
}
