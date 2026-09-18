import { mkdtempSync, promises as fs, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { TRAINING_UPLOAD_CHUNK } from './training.constants';
import { TrainingService } from './training.service';

/** Завантаження відео частинами: збирання файлу, повтори, захист сесії. */
describe('TrainingService — завантаження частинами', () => {
  let dir: string;
  let service: TrainingService;
  const admin = { id: 7, person: { surname: 'Тест', name: 'Адмін' } };

  const asReq = (buf: Buffer) => Readable.from([buf]) as any;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'training-'));
    process.env.TRAINING_STORAGE_DIR = dir;
    service = new TrainingService({ getOrThrow: () => 'secret' } as any);
    await service.onModuleInit();
  });

  afterEach(() => {
    delete process.env.TRAINING_STORAGE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('збирає файл із частин (включно з неповною останньою) і створює запис', async () => {
    const size = TRAINING_UPLOAD_CHUNK * 2 + 1234;
    const file = Buffer.alloc(size);
    for (let i = 0; i < size; i++) file[i] = i % 251;

    const init = await service.initUpload(
      { title: 'Урок', topic: 'Тема', fileName: 'lesson.mp4', size },
      admin,
    );
    expect(init.totalChunks).toBe(3);

    // Шматки не по порядку + повтор другого — позиційний запис це витримує
    const chunk = (i: number) =>
      file.subarray(i * init.chunkSize, Math.min(size, (i + 1) * init.chunkSize));
    await service.uploadChunk(init.uploadId, '2', asReq(chunk(2)), admin);
    await service.uploadChunk(init.uploadId, '0', asReq(chunk(0)), admin);
    await service.uploadChunk(init.uploadId, '1', asReq(chunk(1)), admin);
    await service.uploadChunk(init.uploadId, '1', asReq(chunk(1)), admin);

    const created = await service.completeUpload(init.uploadId, admin);
    expect(created.size).toBe(size);
    expect(created.originalName).toBe('lesson.mp4');
    expect(created.createdBy).toBe('Тест Адмін');

    const videos = await fs.readdir(join(dir, 'videos'));
    expect(videos).toHaveLength(1);
    const saved = await fs.readFile(join(dir, 'videos', videos[0]));
    expect(saved.equals(file)).toBe(true);
    // Тимчасові файли сесії прибрані
    expect(await fs.readdir(join(dir, 'parts'))).toHaveLength(0);
  });

  it('не приймає неповну частину і не дає завершити, доки не все отримано', async () => {
    const size = TRAINING_UPLOAD_CHUNK + 10;
    const init = await service.initUpload(
      { title: 'Урок', topic: 'Тема', fileName: 'a.webm', size },
      admin,
    );

    await expect(
      service.uploadChunk(init.uploadId, '0', asReq(Buffer.alloc(100)), admin),
    ).rejects.toThrow('прийшла не повністю');
    await expect(service.completeUpload(init.uploadId, admin)).rejects.toThrow(
      'Завантажено 0 з 2',
    );
  });

  it('відхиляє зайві байти, чужого користувача, формат і розмір', async () => {
    const init = await service.initUpload(
      { title: 'Урок', topic: 'Тема', fileName: 'a.mov', size: 10 },
      admin,
    );
    await expect(
      service.uploadChunk(init.uploadId, '0', asReq(Buffer.alloc(11)), admin),
    ).rejects.toThrow('більша');
    await expect(
      service.uploadChunk(init.uploadId, '0', asReq(Buffer.alloc(10)), { id: 99 }),
    ).rejects.toThrow('інший користувач');

    await expect(
      service.initUpload({ title: 'У', topic: 'Т', fileName: 'a.exe', size: 10 }, admin),
    ).rejects.toThrow('Недозволений формат');
    await expect(
      service.initUpload(
        { title: 'У', topic: 'Т', fileName: 'a.mp4', size: 3 * 1024 ** 3 },
        admin,
      ),
    ).rejects.toThrow('завеликий');
  });

  it('скасування прибирає файли сесії', async () => {
    const init = await service.initUpload(
      { title: 'Урок', topic: 'Тема', fileName: 'a.mp4', size: 10 },
      admin,
    );
    await service.abortUpload(init.uploadId, admin);
    expect(await fs.readdir(join(dir, 'parts'))).toHaveLength(0);
    await expect(service.completeUpload(init.uploadId, admin)).rejects.toThrow(
      'не знайдено',
    );
  });
});
