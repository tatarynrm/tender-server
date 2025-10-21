import { ConfigService } from '@nestjs/config';
import { TypeOptions } from 'src/auth/provider/provider.constants';
import { GoogleProvider } from 'src/auth/provider/services/google.provider';

export const getProvidersConfig = async (
  configSerivce: ConfigService,
): Promise<TypeOptions> => ({
  baseUrl: configSerivce.getOrThrow<string>('APPLICATION_URL'),
  services: [
    new GoogleProvider({
      client_id: configSerivce.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: configSerivce.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      scopes: ['email', 'profile'],
    }),
  ],
});
