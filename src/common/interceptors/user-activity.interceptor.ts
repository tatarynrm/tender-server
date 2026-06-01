import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LOG_ACTIVITY_KEY } from '../decorators/log-activity.decorator';
import { UserActivityService } from 'src/admin/admin-user/user-activity.service';

@Injectable()
export class UserActivityInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private userActivityService: UserActivityService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const action = this.reflector.get<string>(
      LOG_ACTIVITY_KEY,
      context.getHandler(),
    );

    if (!action) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Log asynchronously after successful response
        const user = request.user || (request.cls && request.cls.get('user'));
        const userId = user?.id || request.session?.userId;
        
        if (userId) {
          const ipAddress = request.ip || request.headers['x-forwarded-for'];
          const userAgent = request.headers['user-agent'];
          
          // You can also capture request body or response if you want in metadata
          const metadata = {
            method: request.method,
            url: request.originalUrl,
          };

          this.userActivityService.logActivity({
            userId,
            action,
            ipAddress,
            userAgent,
            metadata,
          });
        }
      }),
    );
  }
}
