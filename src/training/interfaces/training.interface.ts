/** Запис у storage/training/trainings.json. */
export interface ITrainingVideo {
  id: string;
  topic: string;
  title: string;
  description: string;
  /** Ім'я файлу в папці videos/ — назовні не віддається. */
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export type ITrainingVideoPublic = Omit<ITrainingVideo, 'fileName'>;

/** Стан завантаження частинами — storage/training/parts/<uploadId>.json. */
export interface ITrainingUploadSession {
  uploadId: string;
  userId: number;
  originalName: string;
  ext: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  received: number[];
  title: string;
  topic: string;
  description: string;
  createdAt: string;
}

export interface ITrainingUploadInit extends ITrainingVideoInput {
  fileName?: string;
  size?: number | string;
}

export interface ITrainingVideoInput {
  topic?: string;
  title?: string;
  description?: string;
  order?: number | string;
}
