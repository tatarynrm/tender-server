import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class NotificationService {
  constructor(private readonly dbservice: DatabaseService) {}

  async getNotificationSettings() {
    const notification = await this.dbservice.callProcedure('tender_notify');
    return notification;
  }

  async updateNotificationSettings(payload: any) {
    console.log(payload, 'PAYLOAD');

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
}
