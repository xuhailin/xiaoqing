export interface WeatherSkillResult {
    success: boolean;
    content: string;
    error?: string;
}
export interface WeatherSkillExecuteParams {
    location: string;
    dateLabel?: string;
    displayName?: string;
}
