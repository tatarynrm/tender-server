import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export function IsBooleanQuery() {
  return applyDecorators(
    ApiPropertyOptional({ type: Boolean }), // Додає в Swagger
    IsOptional(), // Робить необов'язковим
    IsBoolean(), // Перевіряє, чи це boolean
    Transform(({ value }) => {
      // Логіка перетворення
      if (value === 'true' || value === '1' || value === true) return true;
      if (value === 'false' || value === '0' || value === false) return false;
      return value;
    }),
  );
}
