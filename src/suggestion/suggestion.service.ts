import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class SuggestionService {
    constructor(
        private readonly dbservice: DatabaseService

    ) { }

    async saveSuggestion(dto: any) {
        console.log(dto, 'DTO 12 suggestion');

        return this.dbservice.callProcedure('suggestion_save', dto, {});
    }

}
