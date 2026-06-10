import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AdminUserService } from './admin/admin-user/admin-user.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(AdminUserService);
  
  // Try to get user list
  const list = await service.getAdminUserList({ limit: 1 });
  console.log("LIST ITEM:");
  console.dir(list.content[0], { depth: null });
  
  const id = list.content[0].id;
  
  // Try to get one user
  const one = await service.getAdminOneUser(id);
  console.log("ONE USER ITEM:");
  console.dir(one.content, { depth: null });
  
  await app.close();
}
bootstrap();
