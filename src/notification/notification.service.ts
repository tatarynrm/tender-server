import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly dbservice: DatabaseService,
    private readonly cls: ClsService,
  ) {}

  // person-id поточного користувача (= notify_person.id_person), а не id_usr.
  private currentPersonId(): number | null {
    const user = this.cls.get('user');
    return user?.person?.id ?? null;
  }

  async getNotificationSettings() {
    const notification = await this.dbservice.callProcedure('tender_notify');
    return notification;
  }

  async updateNotificationSettings(payload: any) {
    const result = await this.dbservice.callProcedure(
      'tender_notify_save',
      JSON.stringify(payload),
    );
    return result;
  }

  async getFormData() {
    const result = await this.dbservice.callProcedure(
      'tender_notify_form_data',
    );
    return result;
  }

  // Сповіщення про ставки: від перевізників і від менеджерів ICT.
  async getNotificationRateSettings() {
    const result = await this.dbservice.callProcedure('tender_notify_rate');
    console.log(result, 'RESULT----tender notify rate');

    return result;
  }

  async updateNotificationRateSettings(payload: any) {
    const result = await this.dbservice.callProcedure(
      'tender_notify_rate_save',
      JSON.stringify(payload),
    );
    return result;
  }

  // Список сповіщень поточного користувача (ті, що позначені for_seen),
  // новіші згори. time_seen = null означає непрочитане.
  async getUserNotifications() {
    const idPerson = this.currentPersonId();
    if (!idPerson) return { status: 'ok', content: [] };
    console.log(idPerson, 'ID PERSON');

    const sql = `
      select a.id,
             a.content,
             a.ids_notify_type,
             a.created_at,
             c.value,
             b.time_seen
      from notify a
      left join notify_person b on a.id = b.id_notify
      left join v_notify_type c on a.ids_notify_type = c.ids
      where c.for_seen and b.id_person = $1
      order by a.created_at desc
      limit 100`;

    const result = await this.dbservice.query(sql, [idPerson]);
    return { status: 'ok', content: result.rows };
  }

  // Позначити одне сповіщення прочитаним.
  async markNotificationSeen(idNotify: number) {
    const idPerson = this.currentPersonId();
    if (!idPerson || !idNotify) return { status: 'ok' };

    await this.dbservice.query(
      `update notify_person
         set time_seen = now()
       where id_notify = $1 and id_person = $2 and time_seen is null`,
      [idNotify, idPerson],
    );
    return { status: 'ok' };
  }

  // Позначити всі сповіщення прочитаними.
  async markAllNotificationsSeen() {
    const idPerson = this.currentPersonId();
    if (!idPerson) return { status: 'ok' };

    await this.dbservice.query(
      `update notify_person
         set time_seen = now()
       where id_person = $1 and time_seen is null`,
      [idPerson],
    );
    return { status: 'ok' };
  }
}
