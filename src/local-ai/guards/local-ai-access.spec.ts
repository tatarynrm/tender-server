import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalAiAccessGuard } from './local-ai-access.guard';

/** Мінімальний ExecutionContext — гарду потрібен лише request. */
const contextWith = (user?: { email: string }): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardWith = (emails?: string) =>
  new LocalAiAccessGuard({ get: () => emails } as unknown as ConfigService);

describe('LocalAiAccessGuard', () => {
  it('пускає пошту зі списку', () => {
    expect(
      guardWith().canActivate(contextWith({ email: 'rt@ict.lviv.ua' })),
    ).toBe(true);
  });

  it('не зважає на регістр і пробіли', () => {
    expect(
      guardWith().canActivate(contextWith({ email: ' RT@ICT.Lviv.UA ' })),
    ).toBe(true);
  });

  it('відхиляє будь-яку іншу пошту', () => {
    expect(() =>
      guardWith().canActivate(contextWith({ email: 'someone@ict.lviv.ua' })),
    ).toThrow(ForbiddenException);
  });

  it('відхиляє запит без користувача — fail-closed', () => {
    expect(() => guardWith().canActivate(contextWith())).toThrow(
      ForbiddenException,
    );
  });

  it('читає список із LOCAL_AI_ALLOWED_EMAILS', () => {
    const guard = guardWith('one@ict.lviv.ua, two@ict.lviv.ua');

    expect(guard.canActivate(contextWith({ email: 'two@ict.lviv.ua' }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(contextWith({ email: 'rt@ict.lviv.ua' })),
    ).toThrow(ForbiddenException);
  });
});
