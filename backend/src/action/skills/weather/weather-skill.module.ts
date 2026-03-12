import { Module } from '@nestjs/common';
import { WeatherSkillService } from './weather-skill.service';

@Module({
  providers: [WeatherSkillService],
  exports: [WeatherSkillService],
})
export class WeatherSkillModule {}
