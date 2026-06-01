import { Global, Module, OnModuleInit, Logger } from '@nestjs/common';
import { UserActivityService } from 'src/admin/admin-user/user-activity.service';
import { UserActivityRepository } from 'src/admin/admin-user/user-activity.repository';
import { DatabaseService } from 'src/database/database.service';
import { UserActivityController } from './user-activity.controller';
import { UserModule } from 'src/user/user.module';

@Global()
@Module({
  imports: [UserModule],
  controllers: [UserActivityController],
  providers: [UserActivityService, UserActivityRepository],
  exports: [UserActivityService, UserActivityRepository],
})
export class UserActivityModule implements OnModuleInit {
  private readonly logger = new Logger(UserActivityModule.name);

  constructor(private readonly dbService: DatabaseService) {}

  async onModuleInit() {
    this.logger.log('Initializing usr_activities table...');
    
    const queries = [
      `CREATE TABLE IF NOT EXISTS usr_activities (
        id BIGSERIAL PRIMARY KEY,
        id_usr BIGINT NOT NULL,
        company_id BIGINT,
        action VARCHAR(255) NOT NULL,
        path TEXT,
        duration INT DEFAULT 0,
        ip_address VARCHAR(45),
        usr_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );`,
      `ALTER TABLE usr_activities ADD COLUMN IF NOT EXISTS company_id BIGINT;`,
      `ALTER TABLE usr_activities ADD COLUMN IF NOT EXISTS path TEXT;`,
      `ALTER TABLE usr_activities ADD COLUMN IF NOT EXISTS duration INT DEFAULT 0;`,
      `CREATE INDEX IF NOT EXISTS idx_usr_activities_id_usr_created_at ON usr_activities(id_usr, created_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_usr_activities_action ON usr_activities(action);`,
      `CREATE INDEX IF NOT EXISTS idx_usr_activities_company_id ON usr_activities(company_id);`
    ];

    try {
      for (const query of queries) {
        await this.dbService.query(query);
      }
      this.logger.log('usr_activities table initialized successfully.');
    } catch (error) {
      this.logger.error('Failed to initialize usr_activities table', error);
    }
  }
}

