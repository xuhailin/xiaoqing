export declare class DevTranscriptWriter {
    private readonly logger;
    write(runDir: string, entry: Record<string, unknown>): Promise<void>;
}
