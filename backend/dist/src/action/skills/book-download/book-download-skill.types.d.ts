import type { BookDownloadDebug } from './book-download.executor';
export interface BookDownloadSkillResult {
    success: boolean;
    content: string;
    error?: string;
    debug?: BookDownloadDebug;
    choices?: {
        title: string;
        index: number;
    }[];
}
export interface BookDownloadSkillExecuteParams {
    bookName: string;
    choiceIndex?: number;
}
