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
      INSERT INTO usr_activities (id_usr, id_company, action, ip_address, usr_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const metadataObj = {
      ...(data.metadata || {}),
      path: data.path,
      duration: data.duration,
    };
    
    const params = [
      data.userId,
      data.companyId || null,
      data.action,
      data.ipAddress || null,
      data.userAgent || null,
      JSON.stringify(metadataObj),
    ];

    await this.dbService.query(query, params);
  }

  async getUserActivities(userId: number, cursor?: string, limit: number = 20) {
    let query = `
      SELECT 
        a.id, a.id_usr, a.id_company, a.action, a.ip_address, a.usr_agent, a.metadata, a.created_at,
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
    const rows = result.rows.map(row => ({
      ...row,
      company_id: row.id_company,
      path: row.metadata?.path || null,
      duration: row.metadata?.duration || 0,
    }));

    const hasNextPage = rows.length > limit;
    const activities = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage ? activities[activities.length - 1].created_at.toISOString() : null;

    return {
      activities,
      nextCursor,
    };
  }

  async getCompanyActivities(companyId: number, cursor?: string, limit: number = 20, startDate?: string, endDate?: string) {
    let query = `
      SELECT 
        a.id, a.id_usr, a.id_company, a.action, a.ip_address, a.usr_agent, a.metadata, a.created_at,
        p.surname, p.name, p.last_name
      FROM usr_activities a
      LEFT JOIN usr u ON u.id = a.id_usr
      LEFT JOIN person p ON p.id = u.id_person
      WHERE (a.id_company = $1 OR u.id_company = $1)
    `;
    const params: any[] = [companyId];

    if (startDate) {
      params.push(startDate);
      query += ` AND a.created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND a.created_at <= $${params.length}`;
    }

    if (cursor) {
      params.push(cursor);
      query += ` AND a.created_at < $${params.length}`;
    }

    query += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1);

    const result = await this.dbService.query(query, params);
    const rows = result.rows.map(row => ({
      ...row,
      company_id: row.id_company,
      path: row.metadata?.path || null,
      duration: row.metadata?.duration || 0,
    }));

    const hasNextPage = rows.length > limit;
    const activities = hasNextPage ? rows.slice(0, limit) : rows;
    const nextCursor = hasNextPage ? activities[activities.length - 1].created_at.toISOString() : null;

    return {
      activities,
      nextCursor,
    };
  }

  async getCompanyManagersActivitySummary(companyId: number, startDate?: string, endDate?: string) {
    let query = `
      SELECT 
        u.id as id_usr, 
        p.surname, 
        p.name, 
        p.last_name, 
        COUNT(a.id)::int as activity_count
      FROM usr_activities a
      JOIN usr u ON u.id = a.id_usr
      JOIN person p ON p.id = u.id_person
      WHERE (a.id_company = $1 OR u.id_company = $1)
    `;
    const params: any[] = [companyId];

    if (startDate) {
      params.push(startDate);
      query += ` AND a.created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND a.created_at <= $${params.length}`;
    }

    query += `
      GROUP BY u.id, p.surname, p.name, p.last_name
      ORDER BY activity_count DESC
    `;
    
    const result = await this.dbService.query(query, params);
    return result.rows;
  }
}
