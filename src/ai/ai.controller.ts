import { Controller, Get } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  getStatus() {
    return { status: 'AI Module is active' };
  }

  @Get('list-models')
  async listModels() {
    try {
      return await this.aiService.listModels();
    } catch (error: any) {
      return { 
        error: error.message, 
        status: error.status || 500,
        details: error.stack 
      };
    }
  }
}
