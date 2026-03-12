export type GeneralActionCode = 'OK' | 'NOT_SUPPORTED' | 'VALIDATION_ERROR' | 'EXECUTION_ERROR';
export interface GeneralActionResult {
    ok: boolean;
    code: GeneralActionCode;
    message: string;
    meta?: Record<string, unknown>;
}
export type GeneralAction = {
    type: 'browser.goto';
    url: string;
} | {
    type: 'browser.click';
    url: string;
    selector: string;
} | {
    type: 'browser.fill';
    url: string;
    selector: string;
    value: string;
} | {
    type: 'browser.wait';
    url: string;
    selector: string;
} | {
    type: 'file.read';
    path: string;
} | {
    type: 'file.write';
    path: string;
    content: string;
} | {
    type: 'file.exists';
    path: string;
} | {
    type: 'file.list';
    path: string;
} | {
    type: 'file.mkdir';
    path: string;
};
export type ParseGeneralActionResult = {
    status: 'ok';
    action: GeneralAction;
} | {
    status: 'not_supported';
    reason: string;
} | {
    status: 'validation_error';
    reason: string;
    message: string;
};
