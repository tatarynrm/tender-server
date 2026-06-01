import { Body, Controller, Post, Req } from '@nestjs/common';
import { UserActivityService } from 'src/admin/admin-user/user-activity.service';
import { Authorization } from 'src/auth/decorators/auth.decorator';

@Controller('activities')
export class UserActivityController {
  constructor(private readonly userActivityService: UserActivityService) {}

  @Authorization()
  @Post('track')
  async trackActivity(
    @Req() request: any,
    @Body() body: { action: string; path: string; duration?: number; metadata?: any },
  ) {
    const user = request.user || (request.cls && request.cls.get('user'));
    const userId = user?.id || request.session?.userId;
    const companyId = user?.company?.id;

    if (!userId) {
      return { status: 'ignored', reason: 'unauthorized' };
    }

    const ipAddress = request.ip || request.headers['x-forwarded-for'];
    const userAgent = request.headers['user-agent'];

    await this.userActivityService.logActivity({
      userId,
      companyId,
      action: body.action,
      path: body.path,
      duration: body.duration || 0,
      ipAddress,
      userAgent,
      metadata: body.metadata,
    });

    return { status: 'ok' };
  }
}
