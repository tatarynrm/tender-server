import { Injectable } from '@nestjs/common';
import { UserActivityRepository, CreateUserActivityDto } from './user-activity.repository';

@Injectable()
export class UserActivityService {
  constructor(private readonly repository: UserActivityRepository) {}

  async logActivity(data: CreateUserActivityDto): Promise<void> {
    try {
      await this.repository.logActivity(data);
    } catch (error) {
      console.error('Failed to log user activity:', error);
      // We don't throw here to avoid failing the main request if logging fails
    }
  }

  async getUserActivities(userId: number, cursor?: string, limit?: number) {
    return this.repository.getUserActivities(userId, cursor, limit);
  }

  async getCompanyActivities(companyId: number, cursor?: string, limit?: number) {
    return this.repository.getCompanyActivities(companyId, cursor, limit);
  }
}
