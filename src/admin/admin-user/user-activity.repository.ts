import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

export interface CreateUserActivityDto {
  userId: number;
  companyId?: number;
  action: string;
  path?: string;
  duration?: number;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

@Injectable()
export class UserActivityRepository {
  constructor(private readonly dbService: DatabaseService) {}

  async logActivity(data: CreateUserActivityDto): Promise<void> {
    const query = `
      INSERT INTO usr_activities (id_usr, company_id, action, path, duration, ip_address, usr_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const params = [
      data.userId,
      data.companyId || null,
      data.action,
      data.path || null,
      data.duration || 0,
      data.ipAddress || null,
      data.userAgent || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ];

    await this.dbService.query(query, params);
  }

  async getUserActivities(userId: number, cursor?: string, limit: number = 20) {
    let query = `
      SELECT 
        a.id, a.id_usr, a.company_id, a.action, a.path, a.duration, a.ip_address, a.usr_agent, a.metadata, a.created_at,
        p.surname, p.name, p.last_name
      FROM usr_activities a
      LEFT JOIN usr u ON u.id = a.id_usr
      LEFT JOIN person p ON p.id = u.id_person
      WHERE a.id_usr = $1
    `;
    const params: any[] = [userId];

    if (cursor) {
      query += ` AND a.created_at < $2`;
      params.push(cursor);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1); // Fetch one extra to determine if there's a next page

    const result = await this.dbService.query(query, params);
    const rows = result.rows;

    const hasNextPage = rows.length > limit;
    const activities = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage ? activities[activities.length - 1].created_at.toISOString() : null;

    return {
      activities,
      nextCursor,
    };
  }

  async getCompanyActivities(companyId: number, cursor?: string, limit: number = 20) {
    let query = `
      SELECT 
        a.id, a.id_usr, a.company_id, a.action, a.path, a.duration, a.ip_address, a.usr_agent, a.metadata, a.created_at,
        p.surname, p.name, p.last_name
      FROM usr_activities a
      LEFT JOIN usr u ON u.id = a.id_usr
      LEFT JOIN person p ON p.id = u.id_person
      WHERE a.company_id = $1
    `;
    const params: any[] = [companyId];

    if (cursor) {
      query += ` AND a.created_at < $2`;
      params.push(cursor);
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const result = await this.dbService.query(query, params);
    const rows = result.rows;

    const hasNextPage = rows.length > limit;
    const activities = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage ? activities[activities.length - 1].created_at.toISOString() : null;

    return {
      activities,
      nextCursor,
    };
  }

  async getCompanyManagersActivitySummary(companyId: number) {
    const query = `
      SELECT 
        u.id as id_usr, 
        p.surname, 
        p.name, 
        p.last_name, 
        COUNT(a.id)::int as activity_count
      FROM usr_activities a
      JOIN usr u ON u.id = a.id_usr
      JOIN person p ON p.id = u.id_person
      WHERE a.company_id = $1
      GROUP BY u.id, p.surname, p.name, p.last_name
      ORDER BY activity_count DESC
    `;
    const params = [companyId];
    const result = await this.dbService.query(query, params);
    return result.rows;
  }
}
