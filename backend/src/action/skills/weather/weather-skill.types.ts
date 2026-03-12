/** 本地天气 Skill 执行结果，与 OpenClaw 工具结果格式一致，供小晴转述 */
export interface WeatherSkillResult {
  success: boolean;
  content: string;
  error?: string;
}

export interface WeatherSkillExecuteParams {
  /** 坐标，格式 "经度,纬度"（和风 API 统一用坐标查询） */
  location: string;
  /** 时间标签（今天/明天/后天/当前），可选 */
  dateLabel?: string;
  /** 展示用地名（如 "北京"、"该坐标"），可选 */
  displayName?: string;
}
