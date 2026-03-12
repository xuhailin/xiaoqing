import { BrowserTool } from '../../tools/browser/browser.tool';
import { BrowserSessionManager } from '../../tools/browser/browser-session.manager';
import { FileTool } from '../../tools/file/file.tool';
import { type ResourceConfig } from './book-download.config';
export type BookItem = {
    title: string;
    author: string;
    publisher?: string;
    format: string;
    detailUrl: string;
};
export type BookDownloadDebug = {
    listItemCount: number;
    searchResultCount: number;
    filteredCount: number;
};
export type BookDownloadHandleResult = {
    ok: true;
    message: string;
    debug?: BookDownloadDebug;
} | {
    ok: false;
    message: string;
    choices?: {
        title: string;
        index: number;
    }[];
    debug?: BookDownloadDebug;
};
export interface WorkflowDeps {
    browser?: BrowserTool;
    file?: FileTool;
    config?: ResourceConfig;
    sessionManager?: BrowserSessionManager;
}
export declare function executeBookDownloadWorkflow(bookName: string, deps?: WorkflowDeps, choiceIndex?: number): Promise<BookDownloadHandleResult>;
import { LoginFailedError } from '../../tools/browser/site-auth.service';
export { LoginFailedError };
