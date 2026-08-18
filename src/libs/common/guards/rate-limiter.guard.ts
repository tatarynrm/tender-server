// libs/common/guards/rate-limiter.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerLimitDetail,
} from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  // Throttler застосовуємо ЛИШЕ до HTTP. Для telegraf-оновлень і WS-контекстів
  // (у них немає res.header) гвард інакше падає з "res.header is not a function",
  // ламаючи, зокрема, /start у Telegram-боті.
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    return super.canActivate(context);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    // Можна використати context для додаткової інформації
    throw new ThrottlerException('Забагато запитів. Спробуйте через хвилину 🕐');
  }

  // Повертаємо user-{id} якщо є (залогінений), інакше IP (fallback)
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) {
      return `user-${req.user.id}`;
    }
    // надійніший порядок пошуку IP
    return req.ip || req.headers?.['x-real-ip'] || req.connection?.remoteAddress || 'anon';
  }
}
