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

    async getSuggestions() {
        const sql = `
            SELECT 
                s.id, 
                s.created_at, 
                s.notes, 
                p.name as person_name,
                p.surname as person_surname
            FROM suggestion s
            LEFT JOIN person p ON s.id_person = p.id
            ORDER BY s.created_at DESC
        `;
        const result = await this.dbservice.query(sql);
        return result.rows;
    }
}
