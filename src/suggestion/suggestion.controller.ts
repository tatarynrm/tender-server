import { Body, Controller, Get, Post } from '@nestjs/common';
import { SuggestionService } from './suggestion.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';



@Authorization()
@Controller('suggestion')
export class SuggestionController {
  constructor(private readonly suggestionService: SuggestionService) { }



  @Post('save')
  public async suggestionSave(@Body() dto: any) {
    return this.suggestionService.saveSuggestion(dto);
  }

  @Get('list')
  public async suggestionList() {
    return this.suggestionService.getSuggestions();
  }
}
