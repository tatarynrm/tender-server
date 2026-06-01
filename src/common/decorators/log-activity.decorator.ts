import { SetMetadata } from '@nestjs/common';

export const LOG_ACTIVITY_KEY = 'log_activity';
export const LogActivity = (action: string) => SetMetadata(LOG_ACTIVITY_KEY, action);
