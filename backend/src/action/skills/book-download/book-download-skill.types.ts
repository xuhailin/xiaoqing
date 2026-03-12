import type { BookDownloadDebug } from './book-download.executor';

/** 本地电子书下载 Skill 执行结果，供小晴转述 */
export interface BookDownloadSkillResult {
  success: boolean;
  content: string;
  error?: string;
  /** 搜索/列表/过滤数量，写入 trace 便于排查 */
  debug?: BookDownloadDebug;
  /** 多条匹配时返回候选列表，供用户选择 */
  choices?: { title: string; index: number }[];
}

export interface BookDownloadSkillExecuteParams {
  /** 规范书名（由意图层抽取） */
  bookName: string;
  /** 用户选择的候选序号（第二轮交互传入） */
  choiceIndex?: number;
}
