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

  async getCompanyActivities(companyId: number, cursor?: string, limit?: number, startDate?: string, endDate?: string) {
    return this.repository.getCompanyActivities(companyId, cursor, limit, startDate, endDate);
  }

  async getCompanyManagersActivitySummary(companyId: number, startDate?: string, endDate?: string) {
    return this.repository.getCompanyManagersActivitySummary(companyId, startDate, endDate);
  }

  async getIctManagersActivitySummary() {
    return this.repository.getIctManagersActivitySummary();
  }

  /**
   * Звіт "Активність партнерів" — зовнішні (не ICT) admin/manager по компаніях.
   * Групує плоскі рядки з репозиторію по компаніях і рахує підсумки за період.
   */
  async getExternalPartnersLoginReport(startDate?: string, endDate?: string) {
    const rows = await this.repository.getExternalPartnersLoginReport(
      startDate,
      endDate,
    );

    const map = new Map<string, any>();
    for (const r of rows) {
      const key = r.company_id != null ? String(r.company_id) : 'none';
      if (!map.has(key)) {
        map.set(key, {
          company_id: r.company_id ?? null,
          company_name: r.company_name ?? null,
          company_name_full: r.company_name_full ?? null,
          edrpou: r.edrpou ?? null,
          users: [] as any[],
        });
      }
      map.get(key).users.push({
        id_usr: Number(r.id_usr),
        surname: r.surname,
        name: r.name,
        last_name: r.last_name,
        position: r.position,
        email: r.email,
        is_admin: !!r.is_admin,
        is_manager: !!r.is_manager,
        login_count: Number(r.login_count) || 0,
        first_login: r.first_login,
        last_login: r.last_login,
        last_activity: r.last_activity,
        activity_count: Number(r.activity_count) || 0,
      });
    }

    const companies = Array.from(map.values()).map((c) => {
      const active_users_count = c.users.filter(
        (u: any) => u.login_count > 0,
      ).length;
      const total_logins = c.users.reduce(
        (s: number, u: any) => s + u.login_count,
        0,
      );
      return {
        ...c,
        users_count: c.users.length,
        active_users_count,
        total_logins,
      };
    });

    // Спершу компанії з входами, далі за назвою
    companies.sort(
      (a, b) =>
        b.total_logins - a.total_logins ||
        (a.company_name || '').localeCompare(b.company_name || '', 'uk'),
    );

    const totals = {
      companies_count: companies.length,
      active_companies_count: companies.filter((c) => c.total_logins > 0).length,
      users_count: companies.reduce((s, c) => s + c.users_count, 0),
      active_users_count: companies.reduce(
        (s, c) => s + c.active_users_count,
        0,
      ),
      total_logins: companies.reduce((s, c) => s + c.total_logins, 0),
    };

    return {
      period: { startDate: startDate ?? null, endDate: endDate ?? null },
      totals,
      companies,
    };
  }
}
