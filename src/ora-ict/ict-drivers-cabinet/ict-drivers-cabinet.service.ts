import { Injectable } from '@nestjs/common';
import api5 from 'src/libs/common/utils/api';

@Injectable()
export class IctDriversCabinetService {
  // constructor(private readonly httpService: HttpService) {}
  public async getMainPageInfo(kod?: number) {
    const { data } = await api5.post('/user', {
      KOD_UR: kod || 203531,
    });
    console.log(data, 'DATA');

    return data;
  }
}
