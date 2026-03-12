import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import type { BookDownloadSkillExecuteParams, BookDownloadSkillResult } from './book-download-skill.types';
export declare class BookDownloadSkillService implements ICapability {
    private readonly logger;
    private readonly baseUrl;
    readonly name = "book-download";
    readonly taskIntent = "book_download";
    readonly channels: MessageChannel[];
    readonly description = "\u4E0B\u8F7D\u7535\u5B50\u4E66\uFF08\u7528\u6237\u8BF4\u300C\u4E0B\u8F7Dxxx\u300D\u300C\u5E2E\u6211\u627E\u300Axxx\u300B\u300D\u7B49\uFF09";
    constructor(config: ConfigService);
    isAvailable(): boolean;
    execute(request: CapabilityRequest): Promise<CapabilityResult>;
    executeBookDownload(params: BookDownloadSkillExecuteParams): Promise<BookDownloadSkillResult>;
    private parseParams;
}
