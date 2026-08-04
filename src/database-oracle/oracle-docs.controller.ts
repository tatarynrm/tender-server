import { Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { Authorization } from 'src/auth/decorators/auth.decorator';
import { Authorized } from 'src/auth/decorators/authorized.decorator';
import { OracleSchemaDocsService } from './oracle-schema-docs.service';

/**
 * Документація схеми Oracle — лише для адміністраторів.
 * Рольового гарда в проєкті немає, тому роль перевіряємо вручну
 * по user.role.is_admin, який кладе AuthGuard.
 */
@Controller('oracle/docs')
export class OracleDocsController {
  constructor(private readonly docsService: OracleSchemaDocsService) {}

  private assertAdmin(user: any) {
    if (!user?.role?.is_admin) {
      throw new ForbiddenException('Доступ лише для адміністраторів');
    }
  }

  @Authorization()
  @Get('status')
  getStatus(@Authorized() user: any) {
    this.assertAdmin(user);
    return this.docsService.getStatus();
  }

  @Authorization()
  @Get()
  getDocs(@Authorized() user: any) {
    this.assertAdmin(user);
    return this.docsService.getDocs();
  }

  @Authorization()
  @Post('refresh')
  async refresh(@Authorized() user: any) {
    this.assertAdmin(user);
    return await this.docsService.forceRefresh();
  }
}
