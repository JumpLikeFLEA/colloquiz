import type { SurfaceLang } from "@/lib/alliengll/surfaceLang";

/**
 * The personal area's tab row (SHELL-039, docs/decisions/0251). Imported only
 * by Server Components (MyTabs and its test), so neither language reaches a
 * client bundle (accountCopy's rule, docs/decisions/0079 "Budget").
 */
type MyTabsStrings = {
  /** The <nav>'s accessible name. */
  label: string;
  overview: string;
  notebook: string;
  messages: string;
  settings: string;
};

export const myTabsCopy: Record<SurfaceLang, MyTabsStrings> = {
  ru: { label: "Кабинет", overview: "Обзор", notebook: "Блокнот", messages: "Сообщения", settings: "Настройки" },
  en: { label: "My learning", overview: "Overview", notebook: "Notebook", messages: "Messages", settings: "Settings" },
};
